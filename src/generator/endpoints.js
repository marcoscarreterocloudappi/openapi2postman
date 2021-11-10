/** Part of APIAddicts. See LICENSE fileor full copyright and licensing details. Supported by Madrid Digital and CloudAPPi **/

'use strict'

const _ = require('lodash');

module.exports = function() {
  
  return function get(endpoints){
	const items = [];
	_.forEach(endpoints, function(endpoint){
		let path = endpoint.path;
		let pathParameterSaved = false
		_.forEach(endpoint.pathParameters, function(pathParameter){
			pathParameterSaved = pathParameter.name
			path = _.replace(path, '{'+pathParameter.name+'}', '{{'+pathParameter.name+'}}')
			global.environmentVariables[endpoint.verb+endpoint.path+pathParameter.name] =  require('../utils/exampleForField.js')(pathParameter,false)
		});
		_.forEach(endpoint.status,function(response){
			let item = {
				name: endpoint.path + '-' + response,
				aux: {
					status:response,
					body:endpoint.body ? endpoint.body : false,
					consumes: endpoint.consumes ? endpoint.consumes : false,
					bodyResponse: endpoint.bodyResponse ? endpoint.bodyResponse : false,
					authorization: endpoint.authorization ? endpoint.authorization : false,
					summary: endpoint.summary ? endpoint.summary : false,
					queryParams: endpoint.queryParams ? endpoint.queryParams : false,
					pathParameter: pathParameterSaved
				},	
				response: [], 	
				request: {
					method: endpoint.verb,
					header: [],
					body: {
						mode: "raw",
						raw: ""
					},
					url: {
						raw: "{{host}}{{port}}{{basePath}}"+path,
						host: [
							"{{host}}{{port}}{{basePath}}"
						],
						path: [
							path
						]
					}
				}
			}
			// Cambio de nombre para los POST /recurso/get que tengan definido $filter
			if (item.aux.status >= 200 && item.aux.status < 400 && item.request.method === 'POST') {
				let nameWithoutStatus = item.name.substring(0, item.name.length - 4);
				if (nameWithoutStatus.substring(nameWithoutStatus.length - 4) === '/get' && item.aux.body.properties['$filter']) {
					item.aux.suffix = '$filter ';
				}
			}
			items.push(item);
			// Duplicar los endpoints para cada queryParameter
			if (item.aux.status >= 200 && item.aux.status < 400 && item.aux.queryParams.length > 0) {
				addQueryParamEndpoint(item, items);
			}
		});
	});
	return items;
  };

	// Duplica los casos de éxito por cada queryParameter opcional distinto
	function addQueryParamEndpoint(endpoint, items) {
		let requiredParams = [];
		let notRequiredParams;
		
		for (let i in endpoint.aux.queryParams) {
			if (endpoint.aux.queryParams[i].required) {
				requiredParams.push(endpoint.aux.queryParams[i]);
			}
		}
		notRequiredParams = _.difference(endpoint.aux.queryParams, requiredParams);
		for (let i in notRequiredParams) {
			let item = _.cloneDeep(endpoint);
			item.aux.queryParams = _.concat(requiredParams, notRequiredParams[i]);
			item.aux.suffix = `queryString ${notRequiredParams[i].name} `;
			items.push(item);
		}
	}

}()