/**
 * marked-plantuml is a marked wrapper to parse your markdown sources,
 * extract PlantUML blocks and render images (from a PlantUML server, locally or URL).
 *
 * Copyright (c) 2020 Alexander Schenkel
 * Licensed under the MIT license.
 */
import 'core-js';
import 'regenerator-runtime';

import path from 'path';
import fs from 'fs';
import childProcess from 'child_process';
import fetch from 'node-fetch';
import zlib from 'zlib';

const exec = childProcess.exec;

/**
 * Helper function for PlantUML local image generation:
 * gets the source html and executes a locally installed plantuml
 * instance, generating the images in the destination folder.
 * 
 * @param {Array} blocks Array of block objects
 * @param {Object} options Needed options for local image generation
 */
function generatePlantUmlImagesLocally(blocks, options) {
    // Write content of each block separately to a temporary file, to be processed by PlantUML:
    // Drawback: Each block executes its own instance of PlantUML.
    return Promise.all(
        blocks.map((block, i) => {
            const tmpFile = path.join(options.plantumlOutputDir, `marked.plantuml-block-${i}.tmp`);
            return writeFilePromise(tmpFile, block.block, { encoding: 'binary' })
                .then(() => execPromise(`"${options.plantumlExec}" -t${block.ending} "${tmpFile}"`))
                .then(() => unlinkPromise(tmpFile));
        })
    );
}

/**
 * Helper function for PlantUML remote server rendering:
 * gets the source html and the extracted plantuml blocks
 * and sends them to a PlantUML server to be rendered,
 * storing the created images in the destination folder.
 *
 * @param {Array} blocks Array of block objects
 * @param {Object} options task options related to PlantUML (need: exec, imageFormat)
 */
async function generatePlantUmlImagesRemote(blocks, options) {
    // process blocks in serial/chaining flow:
    for (let i in blocks) {
        let block = blocks[i];
        let encodedStr = plantumlCompress(block.innerUml);
        let url = options.renderServerUrl + '/' + block.ending + '/' + encodedStr;
        let response = await getFromUrl(url);
        let imgFile = path.join(options.plantumlOutputDir, block.imageFilename);
        await writeFilePromise(imgFile, response, { encoding: 'binary' });
    }
}

/**
 * Helper function to generate a PlantUML image url:
 * gets the source html and the extracted plantuml blocks,
 * generates an encoded PlantUML render URL and replaces imageUrl
 * im the block info.
 * Does NOT create a local image file.
 *
 * @param {Array} blocks Array of block objects
 * @param {Object} options task options related to PlantUML (need: exec, imageFormat)
 */
async function generatePlantUmlImagesAsUrl(blocks, options) {
    for (let i in blocks) {
        let block = blocks[i];
        let encodedStr = plantumlCompress(block.innerUml);
        let url = options.renderServerUrl + '/' + block.ending + '/' + encodedStr;
        block.imageUrl = url;
    }
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
        options = Object.assign(
            {
                plantumlOutputType: options.plantumlOutputType || 'image',
                plantumlExec: options.exec || null,
                renderServerUrl: options.renderServerUrl || null,
                plantumlOutputDir: options.plantumlOutputDir || process.cwd(),
                plantumlBase: options.plantumlBase || '.',
            },
            options
        );

        if (options.plantumlOutputType === 'image') {
            // if output type is 'image', we need:
            // - either a renderServerURL
            // - or the path to the plantuml exec
            if (!options.plantumlExec && !options.renderServerUrl) {
                throw new Error('PlantUML: No "exec" or "renderServerUrl" in config.');
            }
        } else if (options.plantumlOutputType === 'url') {
            // if output type is 'url', we need the render server url:
            if (!options.renderServerUrl) {
                throw new Error('PlantUML: No "renderServerUrl" in config.');
            }
        } else {
            throw new Error('Unknown PlantUML output type: ' + options.plantumlOutputType);
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
            let imageFilename = makeFilename(title, ending);
            return {
                block: plantumlInfo[0],
                innerUml: plantumlInfo[4].trim(),
                title: title,
                ending: ending,
                imageFilename: imageFilename,
                imageUrl: `${options.plantumlBase}/${encodeURIComponent(imageFilename)}`,
                replaceRegex: replaceRe,
            };
        });

        if (matches.length > 0) {
            let promise = null;
            if (options.plantumlOutputType === 'image') {
                if (options.plantumlExec) {
                    promise = generatePlantUmlImagesLocally(plantumlBlocks, options);
                } else if (options.renderServerUrl) {
                    promise = generatePlantUmlImagesRemote(plantumlBlocks, options);
                }
            } else if (options.plantumlOutputType === 'url') {
                promise = generatePlantUmlImagesAsUrl(plantumlBlocks, options);
            }
            promise
                .then((res) => {
                    plantumlBlocks.forEach((block) => {
                        // Form replacement regex: match @startuml [title] to replace the
                        // correct block, replace it by a md image:
                        src = src.replace(block.replaceRegex, `![${block.title}](${block.imageUrl})`);
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
    return function (...args) {
        return new Promise((resolve, reject) => {
            args.push((err, ...results) => {
                if (err) {
                    return reject(err);
                } else {
                    return resolve.apply(null, results);
                }
            });
            fn.apply(null, args);
        });
    };
}

export default function (marked) {
    const fn = function (src, opt, callback) {
        // First, extract PlantUML diagrams...
        return extractPlantUMLContent(src, opt).then((src) => {
            // ... then execute original marked on modified content:
            return promisifyNodeFn(marked)(src, opt).then(callback).catch(callback);
        });
    };
    // Expose original marked function:
    fn.marked = marked;
    return fn;
}
