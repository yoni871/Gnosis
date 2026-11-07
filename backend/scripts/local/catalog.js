const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
// Explicit license allowlist. Unknown future collections require a reviewed entry here.
const commentaryKeys = ['augustine','barnes','bengel','benson','bullinger','burkitt','calvin','chrysostom',
    'clarke','dtn','ellicott','expositor','geneva','gill','haydock','jfb','kd','maclaren','matthew-henry',
    'meyer','poole','pulpit','spurgeon','tyndale','vincent','wesley'];
const translations = [
    { abbreviation:'BSB', name:'Berean Standard Bible', file:'backend/src/bsb.xlsx', license:'Public domain' },
    { abbreviation:'KJV', name:'King James Version', file:'backend/src/data/kjv.xlsx', license:'Public domain in the United States' },
    { abbreviation:'ASV', name:'American Standard Version', file:'backend/src/data/asv.xlsx', license:'Public domain' },
    { abbreviation:'WEB', name:'World English Bible', file:'backend/src/data/web.xlsx', license:'Public domain' },
];
function hashFiles(files) {
    const hash = crypto.createHash('sha256');
    for (const file of files) hash.update(path.relative(root,file)).update('\0').update(fs.readFileSync(file));
    return hash.digest('hex');
}
function commentaryFiles(key) {
    return fs.readdirSync(path.join(root,`${key}-restructured`)).filter(f=>f.endsWith('.json')).sort()
        .map(f=>path.join(root,`${key}-restructured`,f));
}
function readCollection(key) {
    const records = new Map();
    let metadata;
    for (const file of commentaryFiles(key)) {
        const data = JSON.parse(fs.readFileSync(file,'utf8'));
        if (!data.book || !Array.isArray(data.entries)) continue;
        metadata ||= {title:data.commentary, author:data.author || 'Tyndale House Publishers'};
        for (const entry of data.entries) {
            const coords = ['start_chapter','start_verse','end_chapter','end_verse'].map(k=>entry[k]);
            if (!coords.every(n=>Number.isInteger(n) && n >= 0) || typeof entry.content !== 'string') {
                throw new Error(`Invalid commentary coordinates or content in ${key}; import aborted.`);
            }
            // Match the schema's natural key; retain the first repository entry on duplicates.
            const id = JSON.stringify([data.book,...coords]);
            if (!records.has(id)) records.set(id,{book:data.book,...entry});
        }
    }
    if (!metadata?.title) throw new Error(`Missing metadata in ${key}`);
    const license = key === 'tyndale' ? 'CC BY-SA 4.0' : 'Public domain (historical edition)';
    const attribution = key === 'tyndale'
        ? 'Adapted from Tyndale Open Study Notes. © 2022 Tyndale House Publishers. Original: https://tyndaleopenresources.com/ . Repository conversion to structured JSON; CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/'
        : `${metadata.title} — ${metadata.author}. Historical commentary; repository structured edition.`;
    return {...metadata,license,attribution,records:[...records.values()]};
}
module.exports = {root,commentaryKeys,translations,hashFiles,commentaryFiles,readCollection};
