'use strict'

const _ = require('lodash');
const fs   = require('fs');
const argv = require('yargs').argv
const path = require('path')

module.exports = function() {
  
  return function get(authorizationTokens){
	if (argv.customAuthorizations){
		try {
			return JSON.parse(fs.readFileSync(argv.customAuthorizations, 'utf8'));
		} catch (e) {
		  	require('../utils/error.js')('error reading '+argv.customAuthorizations);
		}
	}
	if (!authorizationTokens || authorizationTokens.length === 0){
		return {};
	}
	let definition;
	try {
		definition = JSON.parse(fs.readFileSync(argv.authorization, 'utf8'));
	} catch (e) {
	  	definition = false;
	}
	return definition;
  };

}()