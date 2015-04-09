var named = require('node-postgres-named');
var verymodel = require('verymodel');
var lodash = require('lodash');
var assert = require('assert');
var util = require('util');

var default_pg;

var model_cache = {};

function Model() {
    verymodel.VeryModel.apply(this, arguments);
    if (!this.options.pg) this.options.pg = default_pg;
    model_cache[this.options.name] = this;

    this.getDB = function () {
        return this.options.pg || default_pg;
    };

    var model = this;

    this.extendModel({
        getDB: function () {
            return model.options.default_pg || default_pg;
        }
    });
    
    this.registerInsert = function (ropts) {
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
                this.getDB().query(query, input, function (err, result) {
                    if (!err && result.rows.length > 0) {
                        this.id = result.rows[0].id;
                        return callback(err, this);
                    }
                    return callback(err);
                }.bind(this));
            },
        });
    };

    this.registerUpdate = function (ropts) {
        assert.equal(typeof ropts, 'object');
        assert.equal(typeof ropts.table, 'string', "Specify a table.");
        assert.equal(typeof model.primary, 'string', "This model needs a primary field.");
        assert.equal(typeof model.get, 'function', "This model needs a get function. Use registerGet or make your own.");
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
                this.getDB().query(query, this.toJSON({withPrivate: true}), function (err, result) {
                    if (!err) {
                        return callback(err, this);
                    }
                    return callback(err);
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

    this.registerFactorySQL = function (ropts) {
        assert.equal(typeof ropts.name, 'string');
        assert.equal(typeof ropts.sql, 'string');

        this[ropts.name] = function (opts, callback) {
            callback = typeof opts === 'function' ? opts : callback;
            if (ropts.oneArg !== true) {
                opts = typeof opts === 'object' ? opts : {};
                if (ropts.hasOwnProperty('defaults')) {
                    console.log("has defaults");
                    assert.equal(typeof ropts.defaults, 'object');
                    opts = lodash.defaults(opts, ropts.defaults);
                }
            } else {
                opts = {'arg': opts};
            }
            console.log(ropts.sql, opts);
            this.getDB().query(ropts.sql, opts, function (err, results) {
                var rows = [];
                if (!err) {
                    results.rows.forEach(function (row) {
                       rows.push(this.create(row));
                    }.bind(this));
                }
                if (ropts.oneResult === true) {
                    if (rows.length > 0) {
                        return callback(err, rows[0]);
                    }
                    return callback(err, null);
                }
                callback(err, rows);
            }.bind(this));
        }.bind(this);
    };

    this.registerInstanceSQL = function (name, returnModel, sql) {
        if (!(returnModel instanceof Model)) {
            returnModel = model_cache[returnModel];
        }
        var extension = {};
        extension[name] = function (opts, cb) {
            if (typeof opts === 'function') {
                cb = opts;
                opts = {};
            }
            var extendedOps = lodash.extend(opts, this.toJSON());
            this.getDB().query(sql, opts, function (err, results) {
                var rows = [];
                if (!err) {
                    results.rows.forEach(function (row) {
                       rows.push(returnModel.create(row));
                    }.bind(this));
                }
                cb(err, rows);
            }.bind(this));
        };
        this.extendModel(extension);
    };

}).call(Model.prototype);



module.exports = {
    registerPG: function (pg) {
        named.patch(pg);
        default_pg = pg;
    },
    Model: Model

}
