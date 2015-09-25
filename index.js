var named = require('node-postgres-named');
var verymodel = require('verymodel');
var lodash = require('lodash');
var assert = require('assert');
var util = require('util');
var pg = require('pg');

var default_connection;

var model_cache = {};

function Model() {
    verymodel.VeryModel.apply(this, arguments);
    if (!this.options.connection) this.options.connection = default_connection;
    model_cache[this.options.name] = this;

    this.getDB = function (callback) {
        pg.connect(this.options.connection, function (err, client, done) {

            if (err) {
                return err;
            }

            if (!client.query.patched) {
                named.patch(client);
            }

            return callback(null, client, done);
        });
    };

    var model = this;

    this.extendModel({
        getDB: function () {
            pg.connect(model.options.connection, function (err, client, done) {

                if (err) {
                    return err;
                }

                if (!client.query.patched) {
                    named.patch(client);
                }

                return callback(null, client, done);
            });
        }
    });
    
    this.genInsert = function (ropts) {
        assert.equal(typeof ropts, 'object');
        assert.equal(typeof ropts.table, 'string');
        assert.equal(typeof model.primary, 'string', "This model needs a primary field.");

        this.extendModel({
            insert: function (callback) {
                var input = this.toJSON({withPrivate: true, withAliases: true});
                var keys;
                if (Array.isArray(ropts.fields)) {
                    keys = ropts.fields;
                } else {
                    keys = Object.keys(input).filter(function (key) {
                        if (model.getDefinition(key).sqlField === false) {
                            return false;
                        }
                        return true;
                    });
                }
                var fieldq = " (" + keys.join(", ") + ")";
                var valueq = " values (" + keys.map(function (key) {
                    return "$" + key;
                }).join(", ") + ")";
                var query = util.format("INSERT INTO %s %s %s RETURNING %s", ropts.table, fieldq, valueq, model.alias[model.primary])
                this.getDB(function (err, client, dbDone) {
                    if (err) {
                        dbDone();
                        return callback(err);
                    }

                    return client.query(query, input, function (err, result) {
                        if (!err && result.rows.length > 0) {
                            this.id = result.rows[0].id;
                            dbDone();
                            return callback(err, this);
                        }
                        dbDone();
                        return callback(err);
                    }.bind(this));
                }.bind(this));
            },
        });
    };

    this.genUpdate = function (ropts) {
        assert.equal(typeof ropts, 'object');
        assert.equal(typeof ropts.table, 'string', "Specify a table.");
        assert.equal(typeof model.primary, 'string', "This model needs a primary field.");
        assert.equal(typeof model.get, 'function', util.format("This model, %n needs a get function.", model.options.name));
        this.extendModel({
            update: function (callback) {
                var changes = this.getChanges();
                var query = util.format("UPDATE %s SET", ropts.table);
                var sets = [];
                Object.keys(changes).forEach(function (field) {
                    if (changes[field].changed && model.getDefinition(field).sqlField !== false) {
                        sets.push(util.format(" %s=$%s", model.alias[field], field));
                    }
                });
                if (sets.length === 0) {
                    return callback("No fields were updated", this);
                }
                query += sets.join(", ");
                query += util.format(" WHERE %s=$%s", model.alias[model.primary], model.primary);
                this.getDB(function (err, client, dbDone) {
                    if (err) {
                        dbDone();
                        return callback(err);
                    }

                    return client.query(query, this.toJSON({withPrivate: true}), function (err, result) {
                        if (!err) {
                            dbDone();
                            return callback(err, this);
                        }
                        dbDone();
                        return callback(err);
                    }.bind(this));
                }.bind(this));
            }
        });
        this.update = function (id, payload, callback) {
            this.get(id, function (err, model) {
                if (err) {
                    return callback(err, null);
                }
                Object.keys(payload).forEach(function (key) {
                    model[key] = payload[key];
                });
                model.update(callback);
            });
        };
    }

}

Model.prototype = Object.create(verymodel.VeryModel.prototype);

(function () {

    this.fromSQL = function (ropts) {
        assert.equal(typeof ropts, 'object');
        if (ropts.instance) {
            return this.registerInstanceSQL(ropts);
        }
        return this.registerFactorySQL(ropts);
    }

    this.registerFactorySQL = function (ropts) {
        assert.equal(typeof ropts.name, 'string');
        assert.equal(typeof ropts.sql, 'string');

        this[ropts.name] = function (opts, callback) {
            callback = typeof opts === 'function' ? opts : callback;
            if (ropts.oneArg !== true) {
                opts = typeof opts === 'object' ? opts : {};
                if (ropts.hasOwnProperty('defaults')) {
                    assert.equal(typeof ropts.defaults, 'object');
                    opts = lodash.defaults(opts, ropts.defaults);
                }
            } else {
                opts = {'arg': opts};
            }
            this.getDB(function (err, client, dbDone) {
                if (err) {
                    dbDone();
                    return callback(err);
                }

                return client.query(ropts.sql, opts, function (err, results) {
                    var rows = [];
                    if (!err) {
                        results.rows.forEach(function (row) {
                           rows.push(this.create(row));
                        }.bind(this));
                    }
                    if (ropts.oneResult === true) {
                        if (rows.length > 0) {
                            dbDone();
                            return callback(err, rows[0]);
                        }
                        dbDone();
                        return callback(err, null);
                    }
                    dbDone();
                    callback(err, rows);
                }.bind(this));
            }.bind(this));
        }.bind(this);
    };

    this.registerInstanceSQL = function (ropts) {
        var model = this;
        if (!ropts.model) {
            ropts.model = this;
        }
        if (typeof ropts.model === 'string') {
            ropts.model = model_cache[ropts.model];
        }
        assert.equal(typeof ropts.name, 'string');
        assert.equal(typeof ropts.sql, 'string');
        var extension = {};
        extension[ropts.name] = function (opts, callback) {
            if (typeof opts === 'function') {
                cb = opts;
                opts = {};
            }
            var extendedOps;
            if (ropts.asJSON) {
                opts[model.options.name] = this.toJSON();
                extendedOps = opts;
            } else {
                extendedOps = lodash.extend(opts, this.toJSON());
            }
            this.getDB(function (err, client, dbDone) {
                if (err) {
                    dbDone();
                    return callback(err);
                }

                client.query(ropts.sql, extendedOps, function (err, results) {
                    var rows = [];
                    if (!err) {
                        results.rows.forEach(function (row) {
                           rows.push(ropts.model.create(row));
                        }.bind(this));
                    }
                    if (ropts.oneResult === true) {
                        if (rows.length > 0) {
                            dbDone();
                            return callback(err, rows[0]);
                        }
                        dbDone();
                        return callback(err, null);
                    }
                    dbDone();
                    callback(err, rows);
                }.bind(this));
            }.bind(this));
        };
        this.extendModel(extension);
    };

}).call(Model.prototype);



module.exports = {
    setConnection: function (connection) {
        default_connection = connection;
    },
    Model: Model

}
