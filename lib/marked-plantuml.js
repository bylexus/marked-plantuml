/**
 * grunt-md2html - Helper functions
 * https://github.com/bylexus/grunt-md2html
 *
 * Copyright (c) 2013-2020 Alexander Schenkel
 * Licensed under the MIT license.
 */

const path = require('path');
const fs = require('fs');
const exec = require('child_process').exec;

/**
 * Helper function for PlantUML local image generation:
 * gets the source html and executes a locally installed plantuml
 * instance, generating the images in the destination folder.
 * @param {String} src The source content (md, html), containing plantuml blocks
 * @param {String} destFile The path to the final html file
 * @param {Object} plantumlOptions task options related to PlantUML (needed: exec OR)
 * @param {Array} blocks Array of block objects
 */
function generatePlantUmlImagesLocally(blocks, options) {
    // Write content of each block separately to a temporary file, to be processed by PlantUML:
    // Drawback: Each block executes its own instance of PlantUML.
    return Promise.all(blocks.map((block,i) => {
        const tmpFile = path.join(options.plantumlOutputDir,`marked.plantuml-block-${i}.tmp`);
        return writeFilePromise(tmpFile, block.block,{encoding: 'binary'} )
            .then(() => execPromise(`"${options.plantumlExec}" -t${block.ending} "${tmpFile}"`))
            .then(() => unlinkPromise(tmpFile));
    }));
}

/**
 * Helper function for PlantUML remote server rendering:
 * gets the source html and the extracted plantuml blocks
 * and sends them to a PlantUML server to be rendered,
 * storing the created images in the destination folder.
 *
 * @param {String} src The source content (md, html), containing plantuml blocks
 * @param {String} destFile The path to the final html file
 * @param {Object} plantumlOptions task options related to PlantUML (need: exec, imageFormat)
 * @param {Array} blocks Array of block objects
 * @param {grunt} grunt The grunt instance
 */
async function generatePlantUmlImagesRemote(blocks, options) {
    // process blocks in serial/chaining flow:
    for (let i in blocks) {
        let block = blocks[i];
            let encodedStr = plantumlCompress(block.innerUml);
            let url = options.renderServerUrl + '/' + block.ending + '/' + encodedStr;
            let response = await getFromUrl(url);
            let imgFile = path.join(options.plantumlOutputDir, block.imageFilename);
            await writeFilePromise(imgFile, response, {encoding: 'binary'});
    }
    /*
    return new Promise((resolve, reject) => {
        let promises = [];
        blocks.forEach((block, i) => {
            let encodedStr = plantumlCompress(block.innerUml);
            let url = options.renderServerUrl + '/' + block.ending + '/' + encodedStr;
            promises.push(getFromUrl(url).then(response => {
                let imgFile = path.join(options.plantumlOutputDir, block.imageFilename);
                return writeFilePromise(imgFile, response, {encoding: 'binary'});
            }));
        });
        Promise.all(promises)
            .then(resolve)
            .catch(reject);
    });
    */
}

/**
 * Processes PlantUML blocks if available, and creates the images / replacement links.
 *
 * @param {String} src The source content (md, html), containing plantuml blocks
 * @param {Object} options
 */
function extractPlantUMLContent(src, options) {
    return new Promise((resolve, reject) => {
        options = options || {};
        options = Object.assign({
            plantumlExec: options.exec || null,
            renderServerUrl: options.renderServerUrl || null,
            plantumlOutputDir: options.plantumlOutputDir || process.cwd(),
            plantumlBase: options.plantumlBase || '.'
        }, options)

        if (!options.plantumlExec && !options.renderServerUrl) {
            throw new Error('PlantUML: No "exec" or "renderServerUrl" in config.');
        }

        // We match @startuml [title] ... @enduml blocks:
        let matches = src.match(/@startuml\s+([^\n\r]+)([\s\S]*?)@enduml\b/gm);
        matches = matches || [];
        let plantumlBlocks = matches.map((match) => {
            // Matches:
            // 0: all      1        3      4
            // @startuml [title][.ending] .... @enduml:
            let plantumlInfo = match.match(/@startuml\s+([^\n\r]+?)(\.([^\.\r\n]+))*[\r\n]+([\s\S]*?)@enduml\b/);
            let title = plantumlInfo[1];
            let ending = plantumlInfo[3] || 'png';
            let replaceRe = new RegExp('@startuml\\s+' + title + '.*[\\r\\n]+[\\s\\S]*?@enduml\\b');
            return {
                block: plantumlInfo[0],
                innerUml: plantumlInfo[4].trim(),
                title: title,
                ending: ending,
                imageFilename: makeFilename(title, ending),
                replaceRegex: replaceRe
            };
        });

        if (matches.length > 0) {
            let promise = null;
            if (options.plantumlExec) {
                promise = generatePlantUmlImagesLocally(plantumlBlocks, options);
            } else if (options.renderServerUrl) {
                promise = generatePlantUmlImagesRemote(plantumlBlocks, options);
            }
            promise
                .then((res) => {
                    plantumlBlocks.forEach((block) => {
                        // Form replacement regex: match @startuml [title] to replace the
                        // correct block, replace it by a md image:
                        src = src.replace(
                            block.replaceRegex,
                            `![${block.title}](${options.plantumlBase}/${encodeURIComponent(block.imageFilename)})`
                        );
                    });
                    resolve(src);
                })
                .catch(reject);
        } else {
            resolve(src);
        }
    });
}

function makeFilename(title, ending) {
    return `${title}.${ending}`;
}

function getFromUrl(url) {
    const fetch = require('node-fetch');
    return fetch(url).then((res) => res.buffer());
}

/**
 * Encodes a data string in PlantUML-base64. Taken from
 * https://plantuml.com/de/text-encoding
 * @param {String} data
 */
function encode64(data) {
    let r = '';
    for (let i = 0; i < data.length; i += 3) {
        if (i + 2 === data.length) {
            r += append3bytes(data.charCodeAt(i), data.charCodeAt(i + 1), 0);
        } else if (i + 1 === data.length) {
            r += append3bytes(data.charCodeAt(i), 0, 0);
        } else {
            r += append3bytes(data.charCodeAt(i), data.charCodeAt(i + 1), data.charCodeAt(i + 2));
        }
    }
    return r;
}

/**
 * Helper function for encoding PlantUML to string. Taken from
 * https://plantuml.com/de/text-encoding
 */
function append3bytes(b1, b2, b3) {
    let c1 = b1 >> 2;
    let c2 = ((b1 & 0x3) << 4) | (b2 >> 4);
    let c3 = ((b2 & 0xf) << 2) | (b3 >> 6);
    let c4 = b3 & 0x3f;
    let r = '';
    r += encode6bit(c1 & 0x3f);
    r += encode6bit(c2 & 0x3f);
    r += encode6bit(c3 & 0x3f);
    r += encode6bit(c4 & 0x3f);
    return r;
}

/**
 * Helper function for encoding PlantUML to string. Taken from
 * https://plantuml.com/de/text-encoding
 */
function encode6bit(b) {
    if (b < 10) {
        return String.fromCharCode(48 + b);
    }
    b -= 10;
    if (b < 26) {
        return String.fromCharCode(65 + b);
    }
    b -= 26;
    if (b < 26) {
        return String.fromCharCode(97 + b);
    }
    b -= 26;
    if (b === 0) {
        return '-';
    }
    if (b === 1) {
        return '_';
    }
    return '?';
}

/**
 * Encodes a PlantUML string to the encoded form, to be used
 * in URLs directly. Taken from https://plantuml.com/de/text-encoding
 *
 * Create an encoded string from the block: The procedure is as follows:
 * (see https://plantuml.com/text-encoding):
 * 1. Encoded in UTF-8
 * 2. Compressed using Deflate algorithm
 * 3. Reencoded in ASCII using a transformation close to base64
 *
 * @param {String} s The PlantUML string, without @startuml/@enduml tags
 */
function plantumlCompress(s) {
    let zlib = require('zlib');
    // UTF8
    let data = unescape(encodeURIComponent(s));
    // Deflating:
    let deflated = zlib.deflateSync(data, { level: 9 });
    // encoding:
    let urlStr = encode64(deflated.toString('binary'));
    return urlStr;
}

function writeFilePromise(...args) {
    return promisifyNodeFn(fs.writeFile).apply(fs, args);
}

function execPromise(...args) {
    return promisifyNodeFn(exec).apply(null, args);
}

function unlinkPromise(...args) {
    return promisifyNodeFn(fs.unlink).apply(fs, args);
}

function promisifyNodeFn(fn) {
    return function(...args) {
        return new Promise((resolve, reject) => {
            args.push(( err, ...results ) => {
                if (err) {
                    return reject(err);
                } else {
                    return resolve.apply(null, results);
                }
            });
            fn.apply(null, args);
        });
    }
}


module.exports = function(marked) {
    return function(src, opt, callback) {
        // save original marked on instance:
        this.marked = marked;

        // First, extract PlantUML diagrams...
        return extractPlantUMLContent(src, opt).then(src => {
            // ... then execute original marked on modified content:
            return promisifyNodeFn(marked)(src, opt).then(callback).catch(callback);
        });
    }
};
