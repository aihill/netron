/*jshint esversion: 6 */

class SklearnModelFactor {

    match(context) {
        var extension = context.identifier.split('.').pop();
        return extension == 'pkl' || extension == 'joblib';
    }

    open(context, host, callback) { 
        host.require('pickle', (err) => {
            if (err) {
                callback(err, null);
                return;
            }

            var obj = null;

            try {
                var unpickler = new pickle.Unpickler(context.buffer);

                var functionTable = {};

                functionTable['numpy.dtype'] = function(obj, align, copy) { 
                    switch (obj) {
                        case 'i4': this.name = 'int32'; this.itemsize = 4; break;
                        case 'i8': this.name = 'int64'; this.itemsize = 8; break;
                        case 'f4': this.name = 'float32'; this.itemsize = 4; break;
                        case 'f8': this.name = 'float64'; this.itemsize = 8; break;
                        default:
                            if (obj.startsWith('V')) {
                                this.itemsize = Number(obj.substring(1));
                                this.name = 'void' + (this.itemsize * 8).toString();                                      
                            }
                            else {
                                debugger;
                                throw new SklearnError("Unknown dtype '" + obj.toString() + "'.");
                            }
                            break;
                    }
                    this.align = align;
                    this.copy = copy;
                    this.__setstate__ = function(state) {
                        switch (state.length) {
                            case 8:
                                this.version = state[0];
                                this.byteorder = state[1];
                                this.subarray = state[2];
                                this.names = state[3];
                                this.fields = state[4];
                                this.elsize = state[5];
                                this.alignment = state[6];
                                this.int_dtypeflags = state[7];
                                break;
                            default:
                                throw new pickle.Error("Unknown numpy.dtype setstate length '" + state.length.toString() + "'.");
                        }
                    };
                };
                functionTable['numpy.core.multiarray._reconstruct'] = function(subtype, shape, dtype) {
                    this.subtype = subtype;
                    this.shape = shape;
                    this.dtype = dtype;
                    this.__setstate__ = function(state) {
                        this.version = state[0];
                        this.shape = state[1];
                        this.typecode = state[2];
                        this.is_f_order = state[3];
                        this.rawdata = state[4];
                    };
                };
                functionTable['joblib.numpy_pickle.NumpyArrayWrapper'] = function(subtype, shape, dtype) {
                    this.__setstate__ = function(state, reader) {
                        this.subclass = state.subclass;
                        this.dtype = state.dtype;
                        this.shape = state.shape;
                        this.order = state.order;
                        this.allow_mmap = state.allow_mmap;
                        var size = this.dtype.itemsize;
                        this.shape.forEach((dimension) => {
                            size *= dimension;
                        });
                        this.data = reader.readBytes(size);
                    };
                };
                functionTable['sklearn.externals.joblib.numpy_pickle.NumpyArrayWrapper'] = functionTable['joblib.numpy_pickle.NumpyArrayWrapper'];
                functionTable['sklearn.tree._tree.Tree'] = function(n_features, n_classes, n_outputs) {
                    this.n_features = n_features;
                    this.n_classes = n_classes;
                    this.n_outputs = n_outputs;
                    this.__setstate__ = function(state) {
                        this.max_depth = state.max_depth;
                        this.node_count = state.node_count;
                        this.nodes = state.nodes;
                        this.values = state.values;
                    };
                };
                functionTable['sklearn.linear_model.LogisticRegression'] = function() {}; 
                functionTable['sklearn.naive_bayes.GaussianNB'] = function() {};
                functionTable['sklearn.preprocessing.data.Binarizer'] = function() {};
                functionTable['sklearn.svm.classes.SVC'] = function() {};
                functionTable['sklearn.tree.tree.DecisionTreeClassifier'] = function() {};
                functionTable['sklearn.ensemble.forest.RandomForestClassifier'] = function() {};
                functionTable['sklearn.ensemble.weight_boosting.AdaBoostClassifier'] = function() {};
                functionTable['sklearn.tree.tree.ExtraTreeClassifier'] = function() {
                    this.__setstate__ = function(dict) {
                        debugger;
                    };
                };
                functionTable['sklearn.ensemble.forest.ExtraTreesClassifier'] = function() {};

                var function_call = (name, args) => {
                    if (name == 'copy_reg._reconstructor' && args[1] == '__builtin__.object') {
                        name = args[0];
                        args = [];
                    }
                    if (name == 'numpy.core.multiarray.scalar') {
                        var dtype = args[0];
                        var rawData = args[1];
                        var data = new Uint8Array(rawData.length);
                        for (var i = 0; i < rawData.length; i++) {
                            data[i] = rawData.charCodeAt(i);
                        }
                        var dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
                        switch (dtype.name) {
                            case 'int64':
                                return new Int64(data.subarray(0, dtype.itemsize));
                            default:
                                throw new SklearnError("Unknown scalar type '" + dtype.name + "'.");
                        }
                    }
                    var obj = { __type__: name };
                    var constructor = functionTable[name];
                    if (constructor) {
                        constructor.apply(obj, args);
                    }
                    else {
                        debugger;
                        host.exception(new SklearnError("Unknown function '" + name + "'."), false);
                    }
                    return obj;
                };

                obj = unpickler.load(function_call, null);
            }
            catch (error) {
                callback(error);
                return;
            }

            try {
                var model = new SklearnModel(obj);
                SklearnOperatorMetadata.open(host, (err, metadata) => {
                    callback(null, model);
                });
            }
            catch (error) {
                callback(new SklearnError(error.message), null);
                return;
            }
        });
    }
}

class SklearnModel {

    constructor(obj) {
        this._format = 'scikit-learn';
        if (obj._sklearn_version) {
            this._format += ' ' + obj._sklearn_version.toString();
        }

        this._graphs = [];
        this._graphs.push(new SklearnGraph(obj));
    }

    get format() {
        return this._format;
    }

    get graphs() {
        return this._graphs;
    }

}

class SklearnGraph {

    constructor(obj) {
        this._nodes = [];
        this._nodes.push(new SklearnNode(obj));
    }

    get inputs() {
        return [];
    }

    get outputs() {
        return [];
    }
    
    get nodes() { 
        return this._nodes;
    }

}

class SklearnNode {

    constructor(obj) {
        this._operator = obj.__type__.split('.').pop(); 
        this._attributes = [];

        this._initializers = [];

        Object.keys(obj).forEach((key) => {
            if (!key.startsWith('_')) {
                var value = obj[key];

                if (Array.isArray(value) || Number.isInteger(value) || value == null) {
                    this._attributes.push(new SklearnAttribute(this, key, value));
                }
                else {
                    switch (value.__type__) {
                        case 'joblib.numpy_pickle.NumpyArrayWrapper':
                        case 'sklearn.externals.joblib.numpy_pickle.NumpyArrayWrapper':
                        case 'numpy.core.multiarray._reconstruct':
                            this._initializers.push(new SklearnTensor(key, value));
                            break;
                        default: 
                            this._attributes.push(new SklearnAttribute(this, key, value));
                    }
                }
            }
        });
    }

    get operator() {
        return this._operator;
    }

    get documentation() {
        return SklearnOperatorMetadata.operatorMetadata.getOperatorDocumentation(this.operator);
    }

    get inputs() {
        var inputs = [];
        this._initializers.forEach((initializer) => {
            var input = { connections: [] };
            input.name = initializer.name;
            input.connections.push({
                initializer: initializer,
                type: initializer.type
            });
            inputs.push(input);
        });
        return inputs;
    }

    get outputs() {
        return [];
    }

    get attributes() {
        return this._attributes;
    }
}

class SklearnAttribute {

    constructor(node, name, value) {
        this._node = node;
        this._name = name;
        this._value = value;
    }

    get name() {
        return this._name;
    }

    get value() {
        if (this._value && this._value.constructor.name == 'Int64') {
            return this._value.toString();
        }
        return JSON.stringify(this._value);
    }

    get visible() {
        return SklearnOperatorMetadata.operatorMetadata.getAttributeVisible(this._node.operator, this._name, this._value);
    }
}

class SklearnTensor {

    constructor(name, value) {
        this._name = name;

        switch (value.__type__) {
            case 'joblib.numpy_pickle.NumpyArrayWrapper':
            case 'sklearn.externals.joblib.numpy_pickle.NumpyArrayWrapper':
                this._kind = 'Array Wrapper';
                this._type = new SklearnTensorType(value.dtype.name, value.shape);
                this._data = value.data;
                break;
            case 'numpy.core.multiarray._reconstruct':
                this._kind = 'Array';
                this._type = new SklearnTensorType(value.typecode.name, value.shape);
                this._data = new Uint8Array(value.rawdata.length);
                for (var i = 0; i < this._data.length; i++) {
                    this._data[i] = value.rawdata.charCodeAt(i);
                }
                break;
            default:
                debugger;
        }
    }

    get id() {
        return this._name;
    }

    get name() {
        return this._name;
    }

    get type() {
        return this._type;
    }

    get kind() {
        return this._kind;
    }

    get state() {
        return this._context().state || null;
    }

    get value() {
        var context = this._context();
        if (context.state) {
            return null;
        }
        context.limit = Number.MAX_SAFE_INTEGER;
        return this._decode(context, 0);
    }

    toString() {
        var context = this._context();
        if (context.state) {
            return '';
        }
        context.limit = 10000;
        var value = this._decode(context, 0);
        switch (this._type.dataType) {
            case 'int64':
            case 'uint64':
                return OnnxTensor._stringify(value, '', '    ');
        }
        return JSON.stringify(value, null, 4);
    }

    _context() {
        var context = {};
        context.index = 0;
        context.count = 0;
        context.state = null;

        if (!this._type) {
            context.state = 'Tensor has no data type.';
            return context;
        }
        if (!this._data) {
            context.state = 'Tensor is data is empty.';
            return context;
        }

        context.dataType = this._type.dataType;
        context.shape = this._type.shape;

        switch (context.dataType) {
            case 'float32':
            case 'float64':
            case 'int32':
            case 'uint32':
                context.rawData = new DataView(this._data.buffer, this._data.byteOffset, this._data.byteLength);
                break;
            case 'int64':
            case 'uint64':
                context.rawData = this._data;
                break;
            default:
                context.state = "Tensor data type '" + context.dataType + "' is not implemented.";
                return context;
        }

        return context;
    }

    _decode(context, dimension) {
        var results = [];
        var size = context.shape[dimension];
        if (dimension == context.shape.length - 1) {
            for (var i = 0; i < size; i++) {
                if (context.count > context.limit) {
                    results.push('...');
                    return results;
                }
                switch (context.dataType)
                {
                    case 'float32':
                        results.push(context.rawData.getFloat32(context.index, true));
                        context.index += 4;
                        context.count++;
                        break;
                    case 'float64':
                        results.push(context.rawData.getFloat64(context.index, true));
                        context.index += 8;
                        context.count++;
                        break;
                    case 'int32':
                        results.push(context.rawData.getInt32(context.index, true));
                        context.index += 4;
                        context.count++;
                        break;
                    case 'uint32':
                        results.push(context.rawData.getUint32(context.index, true));
                        context.index += 4;
                        context.count++;
                        break;
                    case 'int64':
                        results.push(new Int64(context.rawData.subarray(context.index, context.index + 8)));
                        context.index += 8;
                        context.count++;
                        break;
                    case 'uint64':
                        results.push(new Uint64(context.rawData.subarray(context.index, context.index + 8)));
                        context.index += 8;
                        context.count++;
                        break;
                }
            }
        }
        else {
            for (var j = 0; j < size; j++) {
                if (context.count > context.limit) {
                    results.push('...');
                    return results;
                }
                results.push(this._decode(context, dimension + 1));
            }
        }
        return results;
    }

    static _stringify(value, indentation, indent) {
        if (Array.isArray(value)) {
            var result = [];
            result.push('[');
            var items = value.map((item) => OnnxTensor._stringify(item, indentation + indent, indent));
            if (items.length > 0) {
                result.push(items.join(',\n'));
            }
            result.push(']');
            return result.join('\n');
        }
        return indentation + value.toString();
    }
}

class SklearnTensorType {

    constructor(dataType, shape) {
        this._dataType = dataType;
        this._shape = shape;
    }

    get dataType() {
        return this._dataType;
    }

    get shape() {
        return this._shape;
    }

    toString() {
        return this.dataType + (this._shape ? ('[' + this._shape.map((dimension) => dimension.toString()).join(',') + ']') : '');
    }
}

class SklearnOperatorMetadata {

    static open(host, callback) {
        if (SklearnOperatorMetadata.operatorMetadata) {
            callback(null, SklearnOperatorMetadata.operatorMetadata);
        }
        else {
            host.request(null, 'sklearn-metadata.json', 'utf-8', (err, data) => {
                SklearnOperatorMetadata.operatorMetadata = new SklearnOperatorMetadata(data);
                callback(null, SklearnOperatorMetadata.operatorMetadata);
            });    
        }
    }

    constructor(data) {
        this._map = {};
        if (data) {
            var items = JSON.parse(data);
            if (items) {
                items.forEach((item) => {
                    if (item.name && item.schema)
                    {
                        this._map[item.name] = item.schema;
                    }
                });
            }
        }
    }

    getOperatorDocumentation(operator) {
        var schema = this._map[operator];
        if (schema) {
            schema = JSON.parse(JSON.stringify(schema));
            schema.name = operator;
            if (schema.description) {
                schema.description = marked(schema.description);
            }
            if (schema.attributes) {
                schema.attributes.forEach((attribute) => {
                    if (attribute.description) {
                        attribute.description = marked(attribute.description);
                    }
                });
            }
            if (schema.inputs) {
                schema.inputs.forEach((input) => {
                    if (input.description) {
                        input.description = marked(input.description);
                    }
                });
            }
            if (schema.outputs) {
                schema.outputs.forEach((output) => {
                    if (output.description) {
                        output.description = marked(output.description);
                    }
                });
            }
            if (schema.references) {
                schema.references.forEach((reference) => {
                    if (reference) {
                        reference.description = marked(reference.description);
                    }
                });
            }
            return schema;
        }
        return '';
    }

    getAttributeVisible(operator, attributeName, attributeValue) {
        var schema = this._map[operator];
        if (schema && schema.attributes && schema.attributes.length > 0) {
            if (!schema.attributeMap) {
                schema.attributeMap = {};
                schema.attributes.forEach(attribute => {
                    schema.attributeMap[attribute.name] = attribute;
                });
            }
            var attribute = schema.attributeMap[attributeName];
            if (attribute) {
                if (attribute.hasOwnProperty('option')) {
                    if (attribute.option == 'optional' && attributeValue == null) {
                        return false;
                    }
                }
                if (attribute.hasOwnProperty('visible')) {
                    return attribute.visible;
                }
                if (attribute.hasOwnProperty('default')) {
                    return !KerasOperatorMetadata.isEquivalent(attribute.default, attributeValue);
                }
            }
        }
        return true;
    }

    getOperatorCategory(operator) {
        var schema = this._map[operator];
        if (schema) {
            var category = schema.category;
            if (category) {
                return category;
            }
        }
        return null;
    }

}

class SklearnError extends Error {
    constructor(message) {
        super(message);
        this.name = 'Error loading scikit-learn model.';
    }
}
