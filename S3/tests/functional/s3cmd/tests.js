'use strict'; // eslint-disable-line strict

const proc = require('child_process');
const process = require('process');
const assert = require('assert');
const fs = require('fs');
require('babel-core/register');
const conf = require('../../../lib/Config').default;

const configCfg = conf.https ? 's3cfg_ssl' : 's3cfg';
const program = 's3cmd';
const upload = 'test1MB';
const emptyUpload = 'Utest0B';
const emptyDownload = 'Dtest0B';
const download = 'tmpfile';
const MPUpload = 'test60MB';
const MPUploadSplitter = [
    'test60..|..MB',
    '..|..test60MB',
    'test60MB..|..',
];
const MPDownload = 'MPtmpfile';
const MPDownloadCopy = 'MPtmpfile2';
const downloadCopy = 'tmpfile2';
const bucket = 'universe';
const nonexist = 'nonexist';
const invalidName = 'VOID';
const emailAccount = 'sampleAccount1@sampling.com';
const lowerCaseEmail = emailAccount.toLowerCase();

const isScality = process.env.CI ? ['-c', `${__dirname}/${configCfg}`] : null;

function diff(putFile, receivedFile, done) {
    process.stdout.write(`diff ${putFile} ${receivedFile}\n`);
    proc.spawn('diff', [putFile, receivedFile]).on('exit', code => {
        assert.strictEqual(code, 0);
        done();
    });
}

function createFile(name, bytes, callback) {
    process.stdout.write(`dd if=/dev/urandom of=${name} bs=${bytes} count=1\n`);
    proc.spawn('dd', ['if=/dev/urandom', `of=${name}`,
        `bs=${bytes}`, 'count=1'], { stdio: 'inherit' }).on('exit', code => {
            assert.strictEqual(code, 0);
            callback();
        });
}

function createEmptyFile(name, callback) {
    process.stdout.write(`touch ${name}\n`);
    proc.spawn('touch', [name], { stdio: 'inherit' }).on('exit', code => {
        assert.strictEqual(code, 0);
        callback();
    });
}

function deleteFile(file, callback) {
    process.stdout.write(`rm ${file}\n`);
    proc.spawn('rm', [`${file}`]).on('exit', () => {
        callback();
    });
}

function exec(args, done, exitCode) {
    let exit = exitCode;
    if (exit === undefined) {
        exit = 0;
    }
    let av = ['-c', configCfg].concat(args);
    if (isScality) {
        av = av.concat(isScality);
    }
    process.stdout.write(`${program} ${av}\n`);
    proc.spawn(program, av, { stdio: 'inherit' }).on('exit', code => {
        assert.strictEqual(code, exit,
                           's3cmd did not yield expected exit status.');
        done();
    });
}

// Test stdout against expected output
function checkRawOutput(args, lineFinder, testString, cb) {
    let av = ['-c', configCfg].concat(args);
    if (isScality) {
        av = av.concat(isScality);
    }
    process.stdout.write(`${program} ${av}\n`);
    const allData = [];
    const child = proc.spawn(program, av);
    child.stdout.on('data', data => {
        allData.push(data.toString());
        process.stdout.write(data.toString());
    });
    child.on('close', () => {
        const foundIt = allData.join('').split('\n')
            .filter(item => item.indexOf(lineFinder) > -1)
            .some(item => item.indexOf(testString) > -1);
        return cb(foundIt);
    });
}


function findEndString(data, start) {
    const delimiter = data[start];
    const end = data.length;
    for (let i = start + 1; i < end; ++i) {
        if (data[i] === delimiter) {
            return (i);
        } else if (data[i] === '\\') {
            ++i;
        }
    }
    return (-1);
}

function findEndJson(data, start) {
    let count = 0;
    const end = data.length;
    for (let i = start; i < end; ++i) {
        if (data[i] === '{') {
            ++count;
        } else if (data[i] === '}') {
            --count;
        } else if (data[i] === '"' || data[i] === "'") {
            i = findEndString(data, i);
        }
        if (count === 0) {
            return (i);
        }
    }
    return (-1);
}

function readJsonFromChild(child, lineFinder, cb) {
    const allData = [];
    child.stderr.on('data', data => {
        allData.push(data.toString());
        process.stdout.write(data.toString());
    });
    child.on('close', () => {
        const data = allData.join('');
        const findLine = data.indexOf(lineFinder);
        const findBrace = data.indexOf('{', findLine);
        const findEnd = findEndJson(data, findBrace);
        const endJson = data.substring(findBrace, findEnd + 1)
            .replace(/"/g, '\\"').replace(/'/g, '"');
        return cb(JSON.parse(endJson));
    });
}

// Pull line of interest from stderr (to get debug output)
function provideLineOfInterest(args, lineFinder, cb) {
    const argsWithCfg = ['-c', configCfg].concat(args);
    const av = isScality ? argsWithCfg.concat(isScality) : argsWithCfg;
    process.stdout.write(`${program} ${av}\n`);
    const child = proc.spawn(program, av);
    readJsonFromChild(child, lineFinder, cb);
}

function retrieveInfo() {
    const configFile = isScality ? `${__dirname}/${configCfg}` : configCfg;
    const data = fs.readFileSync(configFile, 'utf8').split('\n');
    const res = {
        accessKey: null,
        secretKey: null,
        host: null,
        port: 0,
    };
    data.forEach(item => {
        const keyValue = item.split('=');
        if (keyValue.length === 2) {
            const key = keyValue[0].trim();
            const value = keyValue[1].trim();
            if (key === 'access_key') {
                res.accessKey = value;
            } else if (key === 'secret_key') {
                res.secretKey = value;
            } else if (key === 'host_base') {
                const hostInfo = value.split(':');
                if (hostInfo.length > 1) {
                    res.host = hostInfo[0];
                    res.port = parseInt(hostInfo[1], 10);
                } else {
                    res.host = hostInfo[0];
                    res.port = 80;
                }
            }
        }
    });
    return res;
}

function createEncryptedBucket(name, cb) {
    const res = retrieveInfo();
    const prog = `${__dirname}/../../../bin/create_encrypted_bucket.js`;
    let args = [
        prog,
        '-a', res.accessKey,
        '-k', res.secretKey,
        '-b', name,
        '-h', res.host,
        '-p', res.port,
        '-v',
    ];
    if (conf.https) {
        args = args.concat('-s');
    }
    const body = [];
    const child = proc.spawn(args[0], args)
    .on('exit', () => {
        const hasSucceed = body.join('').split('\n').find(item =>
            item.startsWith('{"name":"S3","statusCode":200'));
        if (!hasSucceed) {
            process.stderr.write(`${body.join('')}\n`);
            return cb(new Error('Cannot create encrypted bucket'));
        }
        return cb();
    })
    .on('error', cb);
    child.stdout.on('data', chunk => body.push(chunk.toString()));
}

describe('s3cmd putBucket', () => {
    it('should put a valid bucket', done => {
        exec(['mb', `s3://${bucket}`], done);
    });

    it('put the same bucket, should fail', done => {
        exec(['mb', `s3://${bucket}`], done, 13);
    });

    it('put an invalid bucket, should fail', done => {
        exec(['mb', `s3://${invalidName}`], done, 11);
    });

    it('should put a valid bucket with region (regardless of region)', done => {
        exec(['mb', 's3://regioned', '--region=wherever'], done);
    });

    it('should delete bucket put with region', done => {
        exec(['rb', 's3://regioned', '--region=wherever'], done);
    });

    if (process.env.ENABLE_KMS_ENCRYPTION === 'true') {
        it('creates a valid bucket with server side encryption',
           function f(done) {
               this.timeout(5000);
               exec(['rb', `s3://${bucket}`], err => {
                   if (err) {
                       return done(err);
                   }
                   return createEncryptedBucket(bucket, done);
               });
           });
    }
});

describe('s3cmd put and get bucket ACLs', function aclBuck() {
    this.timeout(60000);
    // Note that s3cmd first gets the current ACL and then
    // sets the new one so by running setacl you are running a
    // get and a put
    it('should set a canned ACL', done => {
        exec(['setacl', `s3://${bucket}`, '--acl-public'], done);
    });

    it('should get canned ACL that was set', done => {
        checkRawOutput(['info', `s3://${bucket}`], 'ACL', '*anon*: READ',
        foundIt => {
            assert(foundIt);
            done();
        });
    });

    it('should set a specific ACL', done => {
        exec(['setacl', `s3://${bucket}`,
        `--acl-grant=write:${emailAccount}`], done);
    });

    it('should get specific ACL that was set', done => {
        checkRawOutput(['info', `s3://${bucket}`], 'ACL',
        `${lowerCaseEmail}: WRITE`, foundIt => {
            assert(foundIt);
            done();
        });
    });
});

describe('s3cmd getBucket', () => {
    it('should list existing bucket', done => {
        exec(['ls', `s3://${bucket}`], done);
    });

    it('list non existing bucket, should fail', done => {
        exec(['ls', `s3://${nonexist}`], done, 12);
    });
});

describe('s3cmd getService', () => {
    it("should get a list of a user's buckets", done => {
        checkRawOutput(['ls'], 's3://', `${bucket}`, foundIt => {
            assert(foundIt);
            done();
        });
    });

    it("should have response headers matching AWS's response headers",
        done => {
            provideLineOfInterest(['ls', '--debug'], 'DEBUG: Response: {',
            parsedObject => {
                assert(parsedObject.headers['x-amz-id-2']);
                assert.strictEqual(parsedObject.headers.server, 'AmazonS3');
                assert(parsedObject.headers['transfer-encoding']);
                assert(parsedObject.headers['x-amz-request-id']);
                const gmtDate = new Date(parsedObject.headers.date)
                    .toUTCString();
                assert.strictEqual(parsedObject.headers.date, gmtDate);
                assert.strictEqual(parsedObject
                    .headers['content-type'], 'application/xml');
                assert.strictEqual(parsedObject
                    .headers['set-cookie'], undefined);
                done();
            });
        });
});

describe('s3cmd putObject', function toto() {
    this.timeout(10000);
    before('create file to put', done => {
        createFile(upload, 1048576, done);
    });

    it('should put file in existing bucket', done => {
        exec(['put', upload, `s3://${bucket}`], done);
    });

    it('should put file with the same name in existing bucket', done => {
        exec(['put', upload, `s3://${bucket}`], done);
    });

    it('put file in non existing bucket, should fail', done => {
        exec(['put', upload, `s3://${nonexist}`], done, 12);
    });
});

describe('s3cmd getObject', function toto() {
    this.timeout(0);
    after('delete downloaded file', done => {
        deleteFile(download, done);
    });

    it('should get existing file in existing bucket', done => {
        exec(['get', `s3://${bucket}/${upload}`, download], done);
    });

    it('downloaded file should equal uploaded file', done => {
        diff(upload, download, done);
    });

    it('get non existing file in existing bucket, should fail', done => {
        exec(['get', `s3://${bucket}/${nonexist}`, 'fail'], done, 12);
    });

    it('get file in non existing bucket, should fail', done => {
        exec(['get', `s3://${nonexist}/${nonexist}`, 'fail2'], done, 12);
    });
});

describe('s3cmd copyObject without MPU to same bucket', function copyStuff() {
    this.timeout(40000);

    after('delete downloaded copy file', done => {
        deleteFile(downloadCopy, done);
    });

    it('should copy an object to the same bucket', done => {
        exec(['cp', `s3://${bucket}/${upload}`,
        `s3://${bucket}/${upload}copy`], done);
    });

    it('should get an object that was copied', done => {
        exec(['get', `s3://${bucket}/${upload}copy`, downloadCopy], done);
    });

    it('downloaded copy file should equal original uploaded file', done => {
        diff(upload, downloadCopy, done);
    });

    it('should delete copy of object', done => {
        exec(['rm', `s3://${bucket}/${upload}copy`], done);
    });
});

describe('s3cmd copyObject without MPU to different bucket ' +
    '(always unencrypted)',
    function copyStuff() {
        const copyBucket = 'receiverbucket';
        this.timeout(40000);

        before('create receiver bucket', done => {
            exec(['mb', `s3://${copyBucket}`], done);
        });

        after('delete downloaded file and receiver bucket' +
            'copied', done => {
            deleteFile(downloadCopy, () => {
                exec(['rb', `s3://${copyBucket}`], done);
            });
        });

        it('should copy an object to the new bucket', done => {
            exec(['cp', `s3://${bucket}/${upload}`,
            `s3://${copyBucket}/${upload}`], done);
        });

        it('should get an object that was copied', done => {
            exec(['get', `s3://${copyBucket}/${upload}`, downloadCopy], done);
        });

        it('downloaded copy file should equal original uploaded file', done => {
            diff(upload, downloadCopy, done);
        });

        it('should delete copy of object', done => {
            exec(['rm', `s3://${copyBucket}/${upload}`], done);
        });
    });

describe('s3cmd put and get object ACLs', function aclObj() {
    this.timeout(60000);
    // Note that s3cmd first gets the current ACL and then
    // sets the new one so by running setacl you are running a
    // get and a put
    it('should set a canned ACL', done => {
        exec(['setacl', `s3://${bucket}/${upload}`, '--acl-public'], done);
    });

    it('should get canned ACL that was set', done => {
        checkRawOutput(['info', `s3://${bucket}/${upload}`], 'ACL',
        '*anon*: READ', foundIt => {
            assert(foundIt);
            done();
        });
    });

    it('should set a specific ACL', done => {
        exec(['setacl', `s3://${bucket}/${upload}`,
            `--acl-grant=read:${emailAccount}`], done);
    });

    it('should get specific ACL that was set', done => {
        checkRawOutput(['info', `s3://${bucket}/${upload}`], 'ACL',
        `${lowerCaseEmail}: READ`, foundIt => {
            assert(foundIt);
            done();
        });
    });

    it('should return error if set acl for ' +
        'nonexistent object', done => {
        exec(['setacl', `s3://${bucket}/${nonexist}`,
            '--acl-public'], done, 12);
    });
});

describe('s3cmd delObject', () => {
    it('should delete existing object', done => {
        exec(['rm', `s3://${bucket}/${upload}`], done);
    });

    it('delete an already deleted object, should return a 204', done => {
        provideLineOfInterest(['rm', `s3://${bucket}/${upload}`, '--debug'],
        'DEBUG: Response: {', parsedObject => {
            assert.strictEqual(parsedObject.status, 204);
            done();
        });
    });

    it('delete non-existing object, should return a 204', done => {
        provideLineOfInterest(['rm', `s3://${bucket}/${nonexist}`, '--debug'],
        'DEBUG: Response: {', parsedObject => {
            assert.strictEqual(parsedObject.status, 204);
            done();
        });
    });

    it('try to get the deleted object, should fail', done => {
        exec(['get', `s3://${bucket}/${upload}`, download], done, 12);
    });
});

describe('connector edge cases', function tata() {
    this.timeout(0);
    before('create file to put', done => {
        createEmptyFile(emptyUpload, done);
    });
    after('delete uploaded and downloaded file', done => {
        deleteFile(upload, () => {
            deleteFile(download, () => {
                deleteFile(emptyUpload, () => {
                    deleteFile(emptyDownload, done);
                });
            });
        });
    });

    it('should put previous file in existing bucket', done => {
        exec(['put', upload, `s3://${bucket}`], done);
    });

    it('should get existing file in existing bucket', done => {
        exec(['get', `s3://${bucket}/${upload}`, download], done);
    });

    it('should put a 0 Bytes file', done => {
        exec(['put', emptyUpload, `s3://${bucket}`], done);
    });

    it('should get a 0 Bytes file', done => {
        exec(['get', `s3://${bucket}/${emptyUpload}`, emptyDownload], done);
    });

    it('should delete a 0 Bytes file', done => {
        exec(['del', `s3://${bucket}/${emptyUpload}`], done);
    });
});

describe('s3cmd multipart upload', function titi() {
    this.timeout(0);
    before('create the multipart file', done => {
        this.timeout(60000);
        createFile(MPUpload, 62914560, done);
    });

    after('delete the multipart and the downloaded file', done => {
        deleteFile(MPUpload, () => {
            deleteFile(MPDownload, () => {
                deleteFile(MPDownloadCopy, done);
            });
        });
    });

    it('should put an object via a multipart upload', done => {
        exec(['put', MPUpload, `s3://${bucket}`], done);
    });

    it('should list multipart uploads', done => {
        exec(['multipart', `s3://${bucket}`], done);
    });

    it('should get an object that was put via multipart upload', done => {
        exec(['get', `s3://${bucket}/${MPUpload}`, MPDownload], done);
    });

    it('downloaded file should equal uploaded file', done => {
        diff(MPUpload, MPDownload, done);
    });

    it('should copy an object that was put via multipart upload', done => {
        exec(['cp', `s3://${bucket}/${MPUpload}`,
        `s3://${bucket}/${MPUpload}copy`], done);
    });

    it('should get an object that was copied', done => {
        exec(['get', `s3://${bucket}/${MPUpload}copy`, MPDownloadCopy], done);
    });

    it('downloaded copy file should equal original uploaded file', done => {
        diff(MPUpload, MPDownloadCopy, done);
    });

    it('should delete multipart uploaded object', done => {
        exec(['rm', `s3://${bucket}/${MPUpload}`], done);
    });

    it('should delete copy of multipart uploaded object', done => {
        exec(['rm', `s3://${bucket}/${MPUpload}copy`], done);
    });

    it('should not be able to get deleted object', done => {
        exec(['get', `s3://${bucket}/${MPUpload}`, download], done, 12);
    });
});

MPUploadSplitter.forEach(file => {
    describe('s3cmd multipart upload with splitter in name', function titi() {
        this.timeout(0);
        before('create the multipart file', done => {
            this.timeout(60000);
            createFile(file, 16777216, done);
        });

        after('delete the multipart and the downloaded file', done => {
            deleteFile(file, () => {
                deleteFile(MPDownload, done);
            });
        });

        it('should put an object via a multipart upload', done => {
            exec(['put', file, `s3://${bucket}`], done);
        });

        it('should list multipart uploads', done => {
            exec(['multipart', `s3://${bucket}`], done);
        });

        it('should get an object that was put via multipart upload', done => {
            exec(['get', `s3://${bucket}/${file}`, MPDownload], done);
        });

        it('downloaded file should equal uploaded file', done => {
            diff(file, MPDownload, done);
        });

        it('should delete multipart uploaded object', done => {
            exec(['rm', `s3://${bucket}/${file}`], done);
        });

        it('should not be able to get deleted object', done => {
            exec(['get', `s3://${bucket}/${file}`, download], done, 12);
        });
    });
});


describe('s3cmd put, get and delete object with spaces ' +
    'in object key names', function test() {
    this.timeout(0);
    const keyWithSpacesAndPluses = 'key with spaces and + pluses +';
    before('create file to put', done => {
        createFile(upload, 1000, done);
    });
    after('delete uploaded and downloaded file', done => {
        deleteFile(upload, () => {
            deleteFile(download, done);
        });
    });

    const bucket = 'freshbucket';

    it('should put a valid bucket', done => {
        exec(['mb', `s3://${bucket}`], done);
    });

    it('should put file with spaces in key in existing bucket', done => {
        exec(['put', upload, `s3://${bucket}/${keyWithSpacesAndPluses}`], done);
    });

    it('should get file with spaces', done => {
        exec(['get', `s3://${bucket}/${keyWithSpacesAndPluses}`, download],
             done);
    });

    it('should list bucket showing file with spaces', done => {
        checkRawOutput(['ls', `s3://${bucket}`], `s3://${bucket}`,
        keyWithSpacesAndPluses, foundIt => {
            assert(foundIt);
            done();
        });
    });

    it('downloaded file should equal uploaded file', done => {
        diff(upload, download, done);
    });

    it('should delete file with spaces', done => {
        exec(['del', `s3://${bucket}/${keyWithSpacesAndPluses}`], done);
    });

    it('should delete empty bucket', done => {
        exec(['rb', `s3://${bucket}`], done);
    });
});

describe('s3cmd info', () => {
// test that CORS and POLICY are returned as 'none'
    it('should find that policy has a value of none', done => {
        checkRawOutput(['info', `s3://${bucket}`], 'policy', 'none',
        foundIt => {
            assert(foundIt);
            done();
        });
    });


    it('should find that cors has a value of none', done => {
        checkRawOutput(['info', `s3://${bucket}`], 'cors', 'none', foundIt => {
            assert(foundIt);
            done();
        });
    });
});

describe('s3cmd delBucket', () => {
    it('delete non-empty bucket, should fail', done => {
        exec(['rb', `s3://${bucket}`], done, 13);
    });

    it('should delete remaining object', done => {
        exec(['rm', `s3://${bucket}/${upload}`], done);
    });

    it('should delete empty bucket', done => {
        exec(['rb', `s3://${bucket}`], done);
    });

    it('try to get the deleted bucket, should fail', done => {
        exec(['ls', `s3://${bucket}`], done, 12);
    });
});
