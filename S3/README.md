# S3 Server

![S3 Server logo](res/Scality-S3-Server-Logo-Large.png)

[![CircleCI][badgepub]](https://circleci.com/gh/scality/S3)
[![Scality CI][badgepriv]](http://ci.ironmann.io/gh/scality/S3)

## Learn more at [s3.scality.com](http://s3.scality.com)

## Contributing

In order to contribute, please follow the
[Contributing Guidelines](
https://github.com/scality/Guidelines/blob/master/CONTRIBUTING.md).

## Installation

### Dependencies

Building and running the S3 Server requires node.js 4.2 or greater and npm 2.7
or greater. Up-to-date versions can be found at
[Nodesource](https://github.com/nodesource/distributions).

### Clone source code

```shell
git clone https://github.com/scality/S3.git
```

### Install js dependencies

Go to the ./S3 folder,

```shell
npm install
```

## Run it with a file backend

```shell
npm start
```

This starts an S3 server on port 8000.
The default access key is accessKey1 with
a secret key of verySecretKey1.

By default the metadata files will be saved in the
localMetadata directory and the data files will be saved
in the localData directory within the ./S3 directory on your
machine.  These directories have been pre-created within the
repository.  If you would like to save the data or metadata in
different locations of your choice, you must specify them. So,
when starting the server:

```shell
export S3DATAPATH="/s3/myFavoriteDataPath"
export S3METADATAPATH="/s3/myFavoriteMetadataPath"
npm start
```

## Run it with an in-memory backend

```shell
npm run mem_backend
```

This starts an S3 server on port 8000.
The default access key is accessKey1 with
a secret key of verySecretKey1.

## Testing

You can run the unit tests with the following command:

```shell
npm test
```

You can run the linter with:

```shell
npm run lint
```

You can run local functional tests with:

```shell
npm run mem_backend &
npm run ft_test
```

## Configuration

If you want to specify an endpoint (other than localhost),
you need to add it to your config.json:

```json
"regions": {

     "localregion": ["localhost"],
     "specifiedregion": ["myhostname.com"]
},
```

Note that our S3server supports both:

- path-style: http://myhostname.com/mybucket
- hosted-style: http://mybucket.myhostname.com

However, hosted-style requests will not hit the server if you are
using an ip address for your host.
So, make sure you are using path-style requests in that case.
For instance, if you are using the AWS SDK for JavaScript,
you would instantiate your client like this:

```js
const s3 = new aws.S3({
   endpoint: 'http://127.0.0.1:8000',
   s3ForcePathStyle: true,
});
```

## s3cmd versions

If using s3cmd as a client to S3 be aware that v4 signature format
is buggy in s3cmd versions < 1.6.1.

[badgepub]: https://circleci.com/gh/scality/S3.svg?style=svg
[badgepriv]: http://ci.ironmann.io/gh/scality/S3.svg?style=svg&circle-token=1f105b7518b53853b5b7cf72302a3f75d8c598ae
