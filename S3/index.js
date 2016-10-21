/*
This script is run when the commands "npm start" or "npm run
mem_backend" are used.
It imports the submodule register and then runs the function
default defined in server.js.
*/

'use strict'; // eslint-disable-line strict

require('babel-core/register')();
require('./lib/server.js').default();
