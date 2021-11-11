/** Part of APIAddicts. See LICENSE fileor full copyright and licensing details. Supported by Madrid Digital and CloudAPPi **/

'use strict'

const _ = require('lodash');
const argv = require('yargs').argv
const fs   = require('fs');

//PARSER-------------------------------- */
let configurationFile
try {
	configurationFile = JSON.parse(fs.readFileSync(argv.configuration, "utf8"))
} catch(err) {
	require('./src/utils/error.js')('Configuration file does not exist or is not correct: ' + argv.configuration);
}

global.definition = require('./src/parser/definition.js')()
const version = require('./src/parser/version.js')()
global.environmentVariables = {}
global.configurationFile = configurationFile

const schemaHostBasePath = require('./src/parser/'+version+'/schemaHostBasePath.js')()
const endpointsParsed = require('./src/parser/endpoints.js')()
const authorizationTokens = []
_.forEach(endpointsParsed, function (endpointParsed, i) {
	endpointsParsed[i].status = require('./src/parser/status.js')(endpointParsed.verb, endpointParsed.path)
	if (endpointParsed.verb === 'POST' || endpointParsed.verb === 'PUT' || endpointParsed.verb === 'PATCH') {
		endpointsParsed[i].body = require('./src/parser/'+version+'/body.js')(endpointParsed.verb, endpointParsed.path)
		endpointsParsed[i].consumes = require('./src/parser/'+version+'/consumes.js')(endpointParsed.verb, endpointParsed.path)
	}
	endpointsParsed[i].pathParameters = require('./src/parser/'+version+'/pathParameters.js')(endpointParsed.verb, endpointParsed.path)
	endpointsParsed[i].bodyResponse = require('./src/parser/'+version+'/body.js')(endpointParsed.verb, endpointParsed.path, true)
	endpointsParsed[i].authorization = require('./src/parser/authorization.js')(endpointParsed.verb, endpointParsed.path, authorizationTokens)
	endpointsParsed[i].queryParams = require('./src/parser/'+version+'/queryParams.js')(endpointParsed.verb, endpointParsed.path)
	endpointsParsed[i].summary = require('./src/parser/summary.js')(endpointParsed.verb, endpointParsed.path)
});

//GENERATOR-------------------------------- */
const endpointsPostman = [];
const endpoints = require('./src/generator/endpoints.js')(endpointsParsed);
_.forEach(endpoints, function (endpoint, i) {
	endpoint = require('./src/generator/testStatus.js')(endpoint);
	endpoint = require('./src/generator/testBody.js')(endpoint);
	endpoint = require('./src/generator/contentType.js')(endpoint);
	endpoint = require('./src/generator/authorization.js')(endpoint, endpoint.aux.status)
	global.currentId = endpoint.request.method + endpoint.request.url.path[0]
	global.currentId = global.currentId.replace(/{{/g,'{').replace(/}}/g,'}').split('?')[0]
	if (endpoint.aux.status === 404 && endpoint.aux.pathParameter) {
		endpoint.request.url.raw = _.replace(endpoint.request.url.raw, '{{' + endpoint.aux.pathParameter + '}}', '{{' +endpoint.aux.pathParameter + '_not_found}}')
		endpoint.request.url.path[0] = _.replace(endpoint.request.url.path[0], '{{' +endpoint.aux.pathParameter + '}}', '{{' +endpoint.aux.pathParameter + '_not_found}}')
		endpoint = require('./src/generator/body.js')(endpoint)
		endpoint = require('./src/generator/queryParamsRequired.js')(endpoint)
		endpointsPostman.push(endpoint)
	} else if (endpoint.aux.status === 400) {
		global.queryParamsRequiredAdded = []
		let endpointPostman
		do{
			endpointPostman = require('./src/generator/queryParamsRequired.js')(endpoint,true)
			if (endpointPostman){
				endpointPostman = require('./src/generator/body.js')(endpointPostman)
				endpointPostman.name += '.without.' + _.last(global.queryParamsRequiredAdded) ;
				endpointPostman.aux.suffix = '.without.' +_.last(global.queryParamsRequiredAdded) ;
				endpointsPostman.push(endpointPostman);
			}
		} while(endpointPostman)
		addBadRequestEndpoints(endpointsPostman, endpoint, 'requiredParams', '', true, false);
		addBadRequestEndpoints(endpointsPostman, endpoint, 'wrongParams', '.wrong', false, true);
	} else if ((endpoint.aux.status >= 200 && endpoint.aux.status < 300) || ((endpoint.aux.status === 401 || endpoint.aux.status === 403) && endpoint.aux.authorization)) {
		endpoint = require('./src/generator/body.js')(endpoint);
		endpoint = require('./src/generator/queryParamsRequired.js')(endpoint);
		endpointsPostman.push(endpoint);
	}
})

//EXPORT-------------------------------- */
let apiName = argv.api_name || configurationFile.api_name;
let environments = configurationFile.environments;
_.forEach(environments, function (element) {
	const endpointsStage = _.cloneDeep(endpointsPostman)
	let exclude = {}
	if ( element.read_only ){
		exclude.write = true
	}

	// Se añaden casos de éxito por cada scope indicado en el fichero de configuración
	// También se añaden los nuevos tokens como variables en la cabecera Authorization
	if (element.has_scopes) {
		let actualLength = endpointsStage.length;
		for (let i = 0; i < actualLength; i++) {
			if (!endpointsStage[i].aux.authorization){
				endpointsStage[i].aux.authorization = 'user_token_with_scope';
				endpointsStage[i].request.header.push({
					key: 'Authorization',
					value: '{{user_token_with_scope}}'
				});
			} 
			if (endpointsStage[i].aux.status >= 200 && endpointsStage[i].aux.status < 400 && endpointsStage[i].aux.authorization) {
				// Añadir el Test Case con application_token
				if (element.application_token) {
					endpointsStage.push(createEndpointWithScope(endpointsStage[i], 'application_token'));
				}
				
				// Añadir la cantidad indicada de Test Cases por cada scope_token
				for (let j = 2; j <= element.number_of_scopes; j++) {
					endpointsStage.push(createEndpointWithScope(endpointsStage[i], endpointsStage[i].aux.authorization + j));
				}
			}
		}
	}

	if ( element.custom_authorizations_file ) {
		require('./src/parser/authorizationRequests.js')(endpointsStage,element.custom_authorizations_file)
	} else {
		// Elimina la cabecera Authorization de las peticiones en Postman
		exclude.auth = true
	}
	let endpointsPostmanWithFolders = require('./src/generator/folders.js')(endpointsStage, exclude)
	let environmentVariables = require('./src/generator/environmentVariablesNames.js')(endpointsPostmanWithFolders)
	
	// Añadir letras a los TestCases con el mismo status code para diferenciarlos en el Runner
	for (let i = element.custom_authorizations_file ? 1 : 0; i < endpointsPostmanWithFolders.length; i++) {
		addLettersToName(endpointsPostmanWithFolders[i].item);
	}
	
	if (element.validate_schema === false){
		require('./src/generator/validateSchema.js')(endpointsPostmanWithFolders)
	}
	if ( apiName ) {
		element.postman_collection_name = _.replace(element.postman_collection_name, '%api_name%', apiName)
		element.postman_environment_name = _.replace(element.postman_environment_name, '%api_name%', apiName)
	}
	require('./src/generator/collection.js')(element.target_folder, element.postman_collection_name, endpointsPostmanWithFolders)
	require('./src/generator/environment.js')(element.target_folder, element.postman_environment_name, element.host, element.port, schemaHostBasePath,environmentVariables)
})

function addBadRequestEndpoints(endpointsPostman, endpointBase, memoryAlreadyAdded, suffix, withoutRequired, withWrongParam) {
	global[memoryAlreadyAdded] = [];
	do {
		var initialCount = global[memoryAlreadyAdded].length;
		let endpointPostman = require('./src/generator/queryParamsRequired.js')(endpointBase);
		endpointPostman = require('./src/generator/body.js')(endpointPostman, withoutRequired, withWrongParam);
		if (global[memoryAlreadyAdded].length > initialCount) {
			endpointPostman.name += '-' + _.last(global[memoryAlreadyAdded]) + suffix;
			endpointPostman.aux.suffix = _.last(global[memoryAlreadyAdded]) + suffix;
			endpointsPostman.push(endpointPostman);
		}
	} while (global[memoryAlreadyAdded].length > initialCount)
}

function createEndpointWithScope(endpoint, name) {
	let scopeEndpoint = _.cloneDeep(endpoint);
	let authHeader = scopeEndpoint.request.header.find(obj => { return obj.key === 'Authorization' });

	scopeEndpoint.aux.authorization = name;
	if (typeof scopeEndpoint.aux.suffix !== 'undefined'){
		scopeEndpoint.aux.suffix += 'with.' + name;
	} else scopeEndpoint.aux.suffix = 'with.' + name;
	authHeader.value = _.replace(authHeader.value, endpoint.aux.authorization, scopeEndpoint.aux.authorization);

	return scopeEndpoint;
}

function addLettersToName(collection) {
	let alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('');

	for (let i in collection) {
		let orderedCollection = _.groupBy(collection[i].item, function(item) { return item.aux.status });
		
		for (let j in orderedCollection) {
			let array = orderedCollection[j];
			if (array.length > 1) {
				// Añade una letra al nombre de cada Test Case, justo despues del status code. Ej.: 200a OK
				// Controla el exceso de Test Cases y añade dos letras en caso de ser necesario. Ej.: 200aa OK, 200ab OK
				for (let k in array) {
					array[k].name = _.replace(array[k].name, array[k].aux.status, 
						k < alphabet.length ? array[k].aux.status + alphabet[k] : array[k].aux.status + alphabet[Math.floor(k / alphabet.length) - 1] + alphabet[k % alphabet.length]);
				}
			}
		}
	}
}