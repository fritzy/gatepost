var named = require('node-postgres-named');
var verymodel = require('verymodel');
var lodash = require('lodash');

var default_pg;

var model_cache = {};

function Model() {
    verymodel.VeryModel.apply(this, arguments);
    if (!this.options.pg) this.options.pg = default_pg;
    model_cache[this.options.name] = this;
}

Model.prototype = Object.create(verymodel.VeryModel.prototype);

(function () {

    this.registerFactorySQL = function (name, sql) {
        this[name] = function (opts, cb) {
            if (typeof opts === 'function') {
                cb = opts;
                opts = {};
            }
            this.options.pg.query(sql, opts, function (err, results) {
                var rows = [];
                if (!err) {
                    results.rows.forEach(function (row) {
                       rows.push(this.create(row));
                    }.bind(this));
                }
                cb(err, rows);
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
            this.__verymeta.options.pg.query(sql, opts, function (err, results) {
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
