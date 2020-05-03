const path = require('path');

module.exports = function (env) {
    return {
        target: 'node',
        entry: './lib/marked-plantuml.js',
        output: {
            filename: 'marked-plantuml.js',
            path: path.resolve(__dirname, 'dist'),
            // Export as NodeJS CommonJS module:
            libraryTarget: 'commonjs2',
            // The library uses ES6 'export default':
            libraryExport: 'default'
        },
        module: {
            rules: [
                {
                    test: /\.m?js$/,
                    exclude: /(node_modules|bower_components)/,
                    use: {
                        loader: 'babel-loader',
                        options: {
                            presets: [
                                [
                                    '@babel/preset-env',
                                    {
                                        useBuiltIns: 'entry',
                                        corejs: '3',
                                        targets: {
                                            node: '6'
                                        }
                                    }
                                ]
                            ]
                        }
                    }
                }
            ]
        }
    };
};
