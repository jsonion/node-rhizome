/*

  # Remapping a JSON object store with a set of instructions

    */

export { remap, parseInstructions, mergePathTree, mergeDistinctPaths, transformToPath, flattenPath }

var conditionalStruct = ['__oneOf', '__anyOf'];
var conditionalType = ['__type'];
var conditionalKey = ['__excludeOnMatch'];


var cache = {

	// Context variables
	context: {},

	// Defined paths to traverse (with schema definitions)
	pathTree: {},

	// Declared objects, mapped to originating paths
	this: {},

	// Objects, currently in processing (defined with "this")
	currentObjects: {},

	// Original schema with mappings to objects
	remap: {},

	// Instructions with links among declared objects
	thisRemap: {},

	// Temporary objects, before linking and sorting
	objects: {},

	// Custom handles on created objects
	onMap: {},

	// Per-object exclude rules as defined with remap schema 
	excludeRules: {},

	results: null,
	errors: []
};


export default function remap (jsonDataset, instructions, context = null, onMap = null) {

	if (context && Object.keys(context).length)
		cache.context = context;

	if (onMap && Object.keys(onMap).length)
		cache.onMap = onMap;

	parseInstructions(instructions);
	//
	// console.log(cache); // Uncomment to reveal internal state
	//
	parseData(cache.pathTree, jsonDataset);

	var results = cache.results;

	cache = {
		context: {},
		pathTree: {},
		currentObjects: {},
		this: {},
		remap: {},
		thisRemap: {},
		objects: {},
		onMap: {},
		excludeRules: {},
		results: null,
		errors: []
	}

	return results;
}


var parseData = function(pathTree, jsonDataset, currentPath = {}) {
	var currentKey = (Object.keys(currentPath).length) ? flattenPath(currentPath) : "",
			pathKeys = (isObject(pathTree)) ? Object.keys(pathTree) : null;


	 //
	// Exclude object from remapping on match ...

	if (typeof cache.excludeRules[currentKey] === 'undefined')
		cache.excludeRules[currentKey] = false;

	if (pathKeys.includes('__excludeOnMatch')) {
		var excludeRules = pathTree['__excludeOnMatch'];

		if (isArray(excludeRules)) {
			for (var i = 0; i < excludeRules.length; i++) {
				var rule = excludeRules[i];

				if (typeof rule === 'string') {
					if (Object.keys(jsonDataset).includes( removeDotPrefix(rule) )){
						cache.excludeRules[currentKey] = true;
						return false;
					}
				} // else: [to-do]
			};
		}
	} else {
		cache.excludeRules[currentKey] = false;
	}


	if (pathKeys && cache.excludeRules[currentKey] == false) {
		pathKeys.forEach((pathKey) => {


			 //
			// Skip if a path isn't found in JSON object

			if (isObject(jsonDataset) && pathKey !== '#' &&
			    !Object.keys(jsonDataset).includes(removeDotPrefix(pathKey)))
				return false;

			if (pathKey === '#' && !isArray(jsonDataset))
				return false;


			 //
			// Config on pathKey loop

			var conditions = (isArray(pathTree[pathKey])) ? pathTree[pathKey] : null,
			    iCondition = -1,
			    object = (isObject(pathTree[pathKey])) ? pathTree[pathKey] : null;


			if (!Object.keys(currentPath).length)
				var nextKey = { [pathKey]: null }
			else
				var nextKey = mergeDistinctPaths(currentPath, pathKey);


			if (conditions) {
				conditions.forEach((condition) => {
					iCondition++;


					 //
					// Conditional struct with possible embedded variables

					var struct = -1;
					if (isObject(condition)) {
						for (var i = 0; i < Object.keys(condition).length; i++) {
							if (struct == -1)
					    	struct = (struct == -1) ? conditionalStruct.indexOf(Object.keys(condition)[i]) : -1;
					    else
					    	break;
						}
					}

					if (struct != -1 &&
					    ('.' == pathKey.charAt(0))) {

						if (isArray(condition[ conditionalStruct[struct] ]) && 
						    'undefined' !== typeof jsonDataset[ removeDotPrefix(pathKey) ] &&
						    'object' !== typeof jsonDataset[ removeDotPrefix(pathKey) ]) {

							var input = jsonDataset[ removeDotPrefix(pathKey) ],
							    buffer,
							    result = {};

							// Type check and transforms
							if (typeof condition['__type'] === 'string')
								var validator = validateType(condition['__type']);
							if (typeof condition['__type'] === 'function')
								var validator = condition['__type'];
							if (typeof validator !== 'undefined')
								input = validator.call(null, input);

							if (input) {
								for (var i = 0; i < condition[ conditionalStruct[struct] ].length; i++) {

									var conditionObj = condition[ conditionalStruct[struct] ][i],
									    keys = Object.keys(condition[ conditionalStruct[struct] ][i]);

									if (isObject(conditionObj)) {
										if (typeof conditionObj['regex'] !== 'undefined') {
											var embeddedVars = getEmbeddedVars(conditionObj['regex']),
											    regex = conditionObj['regex'],
											    error = false;

											if (embeddedVars.length) {
												embeddedVars.forEach((variable) => {

													if (typeof cache.context[variable] !== 'undefined') {
														regex = regex.replace('{'+variable+'}', cache.context[variable])
													} else {
														error = true
														cache.errors.push({'Missing context': variable})
													}
												})
											}

											if (!error) {
												var buffer = jsonDataset[ removeDotPrefix(pathKey) ].match(regex, 'i'),
												    obj = condition[ conditionalStruct[struct] ],
												    objClone = {};

												if ('__oneOf' == conditionalStruct[struct]) {
													if (buffer) {
														for (var j = 0; j < keys.length; j++) {

															if (typeof obj[i][j] !== 'undefined') {
																result = {...result, ...{ [obj[i][j]]: buffer[j+1] }}
															}

															if (!isNumber(keys[j]) && 
															    keys[j] !== 'regex') {
																objClone = {...objClone, ...{ [keys[j]]: obj[i][keys[j]] }};
															}
														}
														result = {...objClone, ...result}
														break;
													}
												}
												/*
												if ('__anyOf' == conditionalStruct[struct]) {
													var buffer = jsonDataset[ removeDotPrefix(pathKey) ].match(regex, 'i') // [to-do] //
												}
												*/
											}
										}
									}
								};
							}

							if (Object.keys(result).length) {
								if (typeof cache.remap[currentKey +" "+ pathKey] !== 'undefined') {

									var remap = popFirstKeyItem(cache.remap[currentKey +" "+ pathKey][iCondition]),
									    order = Object.keys(cache.remap).indexOf(currentKey +" "+ pathKey);

									if(typeof cache.objects[remap[0]] === 'undefined')
										cache.objects[remap[0]] = [];

									if(isArray(remap)) {
										var merge = transformToPath(removeDotPrefix(remap[1]), result);
										    merge["__order"] = order;

										cache.objects[remap[0]].push(mergePathTree(cache.objects[remap[0]], merge))
									}
								}
							}
						}
					}


					 //
					// This is the leaf

					if (typeof condition === 'function' || 
					    typeof condition === 'undefined' ||
					    condition == null) {

						var result,
						    input = (typeof jsonDataset[ removeDotPrefix(pathKey) ] !== 'undefined')
						  ? jsonDataset[ removeDotPrefix(pathKey) ] : null;

						if (typeof condition === 'function')
							result = condition.call(null, input);
						else
							result = input;

						if (typeof cache.remap[currentKey +" "+ pathKey] !== 'undefined' &&
						    result !== false) {

							if (currentKey) {
								var remap = popFirstKeyItem(cache.remap[currentKey +" "+ pathKey][iCondition]),
								    order = Object.keys(cache.remap).indexOf(currentKey +" "+ pathKey);
							} else {
								var remap = popFirstKeyItem(cache.remap[pathKey][iCondition]),
								    order = Object.keys(cache.remap).indexOf(pathKey);
							}

							if(typeof cache.objects[remap[0]] === 'undefined')
								cache.objects[remap[0]] = [];

							if(isArray(remap) && typeof result !== 'undefined') {
								var merge = transformToPath(removeDotPrefix(remap[1]), result);
								    merge["__order"] = order;

								cache.objects[remap[0]].push(mergePathTree(cache.objects[remap[0]], merge))
							}
						}
					}

					 //
					// End of "condition" loop
				});
			}


			if (object) {

				 //
				// The loop

				if ('#' == pathKey.charAt(0) && isArray(jsonDataset)) {

					jsonDataset.forEach((object) => {
						parseData(pathTree[pathKey], object, nextKey)
					});
				}

				 //
				// The path

				if ('.' == pathKey.charAt(0)) {

					if (typeof jsonDataset[ removeDotPrefix(pathKey) ] !== 'undefined') {
						parseData(pathTree[pathKey], jsonDataset[ removeDotPrefix(pathKey) ], nextKey)
					}
				}	
			}

		});


		 //
		// Wrapping up after looping all properties at a level

		if (typeof cache.this[currentKey] !== 'undefined') {
			var objectRef = cache.this[currentKey]

			linkObjects(cache.this[currentKey], cache.thisRemap[objectRef])
		}

		if (currentKey)
			delete cache.excludeRules[currentKey];
	}
}


 //
// To use when generating objects

var linkObjects = function (thisObjectRef, thisRemap) {

	var arrayAt = thisRemap.lastIndexOf('#'),
	    thisRemap = removeDotPrefix(thisRemap);

	if (Object.keys(cache.objects).length > 1) {
		var [objectRef, route] = popFirstKeyItem(thisRemap);
	} else {
		var route = thisRemap
	}
	

   //
  // Sort & merge objects and calculate average order

  var count = 0,
      total = 0,
      avg = 0,

      createObject = {};


  cache.objects[thisObjectRef].forEach((object) => {
  	count = count+1;
  	total = total + object.__order;

  	delete object.__order;

  	createObject = mergeObjects(createObject, object);
  })

  if (count > 0)
  	avg = total / count;


   //
  // onMap hook

  if (typeof cache.onMap !== 'undefined' &&
 	    typeof cache.onMap[thisObjectRef] === 'function') {

  	cache.onMap[thisObjectRef].call(null, thisObjectRef, createObject, cache.results.length);
  }


   //
  // Generate object path

  if (route.length)
  	createObject = generateObjectPath(route, createObject);


  if (objectRef) {
  	cache.objects[objectRef].push({...createObject, __order: avg});

		cache.objects[thisObjectRef].sort((a, b) => {
	    return a.__order - b.__order;
		});
  } else {
  	cache.results = mergeObjects(cache.results, createObject);
  }

  delete cache.objects[thisObjectRef]
}


 //
// Generate object path, transforming # symbols to arrays

var generateObjectPath = function (key, object) {

	var keys = key.split(' ').reverse(),
	    path = null;

	keys.forEach((pathObject) => {

		if (path) {
			if (pathObject == '#') {
				path = [path];
			} else {
				path = {
					[pathObject]: path
				};
			}

		} else {

			if (pathObject == '#') {
				path = [object];
			} else {
				path = {
					[pathObject]: object
				};
			}
		}
	});

	return path;
}



 //
// Merge second object with the first one

var mergeObjects = function (object, merge) {

	var object = (typeof object === 'object') ? object : null;

	if (isArray(object) && isArray(merge)) {
		return object.concat(merge);
	}

	if (isArray(merge) && object == null) {
		return merge;
	}

	if (typeof merge === 'object') {
		var keys = Object.keys(merge);
		if (object == null)
			object = {}

		keys.forEach((key) => {

			if (object != null && typeof object[key] !== 'undefined') {
				object[key] = mergeObjects(object[key], merge[key])
			} else {
				object[key] = merge[key];
			}
		});

		return object
	}
}



/*

  # First step: Parse instructions object

    */

var parseInstructions = function (instructions, currentPath = {}) {
	var instructionKeys = Object.keys(instructions),
	    currentKey = flattenPath(currentPath);


	if (instructionKeys) {

		instructionKeys.forEach((instructionKey) => {
			var object = instructions[instructionKey];


			 //
			// Parsing instruction path

			if (typeof object === 'object' && object !== null && 
			    ('.' == instructionKey.charAt(0) ||
			     '#' == instructionKey.charAt(0))) {


				 //
				// The one case to resolve here comes as a conditional struct

				var structKey = -1;
				for (var i = 0; i <= Object.keys(object).length; i++) {
					if (structKey == -1) {
			    	structKey = (conditionalStruct.indexOf(Object.keys(object)[i]) != -1)
			    	             ? Object.keys(object)[i] : -1
					} else {
			    	break;
					}
				}


				if (structKey != -1 && typeof object[structKey] === 'object') {

					var remap = getRemapKeys(instructionKey),
					    remapKey = (remap && currentKey) ? currentKey +" "+ remap[0] : false,
					    remapKey = (!remapKey && remap) ? remap[0] : remapKey;


					if (instructions['this']) {
						var objectRef = instructions['this'],
						    isCurrentObject = true
					} else {
						var objectRef = getObjectRef(instructionKey),
					      isCurrentObject = (objectRef)
					        ? Object.keys(cache.currentObjects).indexOf(objectRef) : -1;
					}


					if (isCurrentObject !== -1) {
						if (typeof cache.remap[remapKey] === 'undefined')
							cache.remap[remapKey] = [];

						if (remap) {
							cache.remap[remapKey].push(objectRef +" "+ remap[1]);
						} else {
							if (currentKey)
								cache.remap[currentKey +" "+ instructionKey].push(objectRef +" "+ instructionKey);
							else
								cache.remap[instructionKey].push(objectRef +" "+ instructionKey);
						}
					}/* else {

						if (Object.keys(cache.currentObjects).length)
							var objectRef = arrayLastItem(Object.keys(cache.currentObjects))

						if (objectRef) {
							if (remap) {
								cache.remap[remapKey] = 
									objectRef +" "+ flattenPath(cache.currentObjects[objectRef]) +" "+ remap[1];
							} else {
								cache.remap[currentKey +" "+ instructionKey] = 
									objectRef +" "+ flattenPath(cache.currentObjects[objectRef]) +" "+ instructionKey;
							}
						} else {
							if (remap) {
								cache.remap[remapKey] = currentKey +" "+ remap[1];
							} else {
								cache.remap[currentKey +" "+ instructionKey] = currentKey +" "+ instructionKey
							}
						}
					}*/

					if (currentKey) {
						if (remap)
							var path = mergeDistinctPaths(transformToPath(currentKey), transformToPath(remap[0], [object]));
						else
							var path = mergeDistinctPaths(transformToPath(currentKey), transformToPath(instructionKey, [object]));
					} else {
						if (remap)
							var path = transformToPath(remap[0], [object]);
						else
							var path = transformToPath(instructionKey, [object]);	
					}

					cache.pathTree = mergePathTree(cache.pathTree, path);

					return;
				}


				 //
				// Else, parse path instructions when right-hand value is a deeper object
				
				if (!Object.keys(currentPath).length) {
					var nextKey = { [instructionKey]: null }
				} else {
					var nextKey = mergeDistinctPaths(currentPath, instructionKey);
				}


				Object.keys(cache.currentObjects).forEach((key) => {
					cache.currentObjects[key] = mergeDistinctPaths(cache.currentObjects[key], instructionKey);
				});

				parseInstructions(object, nextKey);

				return;
			};


			 //
			// Defining an object at path with "this"

			if ('this' == instructionKey && typeof object === 'string') {
				cache.currentObjects[object] = null;

				if (currentKey)
					cache.this[ currentKey ] = object;
				else
					cache.this[''] = object;

				if (typeof instructions['remap'] !== 'undefined') {
					cache.thisRemap[object] = spaceBeforeDot(instructions['remap']);
				}

				if (!Object.keys(cache.thisRemap).length) {
					if (currentKey)
						cache.thisRemap[object] = currentKey;
					else
						cache.thisRemap[object] = '';
				}

				return;
			}


			 //
			// Explicit remap and a declared object

			if ('remap' == instructionKey && typeof object === 'string') {
				if (getObjectRef(object)) {
					if (currentKey) {
						if (typeof cache.remap[ currentKey ] === 'undefined')
							cache.remap[ currentKey ] = [];

						cache.remap[ currentKey ].push(spaceBeforeDot(object));
					} else {
						if (typeof cache.remap[''] === 'undefined')
							cache.remap[''] = [];

						cache.remap[''].push(spaceBeforeDot(object));
					}
					return;
				}
			}


			/*
			if (typeof object == 'object' && 
			    ('[' == instructionKey.charAt(0))) {} // [to-do] //
			*/


			 //
			// Inline remap

			if (isInlineRemap(instructionKey)) {
				var remap = getRemapKeys(instructionKey),
				    objectRef = getObjectRef(remap[1]);

				if (currentKey) {
					if (typeof cache.remap[currentKey +" "+ remap[0]] === 'undefined')
						cache.remap[currentKey +" "+ remap[0]] = [];
				} else {
					if (typeof cache.remap[remap[0]] === 'undefined')
						cache.remap[remap[0]] = [];
				}

				if (objectRef) {
					if (Object.keys(cache.currentObjects).indexOf(objectRef) !== -1) {
						if (currentKey)
							cache.remap[ currentKey +" "+ remap[0] ].push(spaceBeforeDot(remap[1]));
						else
							cache.remap[ remap[0] ].push(spaceBeforeDot(remap[1]));
					}

				} else {

					objectRef = arrayLastItem(Object.keys(cache.currentObjects));

					if (objectRef) {
						if (currentKey) {
							if (cache.currentObjects[ objectRef ]) {
								cache.remap[ currentKey +" "+ remap[0] ]
								.push( objectRef +" "+ flattenPath(cache.currentObjects[objectRef]) +" "+ remap[1] );
							} else {
								cache.remap[ currentKey +" "+ remap[0] ]
								.push( objectRef +" "+ remap[1] );
							}
						} else {
							if (cache.currentObjects[ objectRef ]) {
								cache.remap[ remap[0] ]
								.push( objectRef +" "+ flattenPath(cache.currentObjects[objectRef]) +" "+ remap[1] );
							} else {
								cache.remap[ remap[0] ]
								.push( objectRef +" "+ remap[1] );
							}
						}
					}
				}
			}


			 //
			// Defined object and remap by its rule

			if (instructions['this'] && !isInlineRemap(instructionKey) && instructionKey !== 'remap') {
				if (cache.currentObjects[instructions['this']] !== 'undefined') {
					if (currentKey) {
						if (typeof cache.remap[ currentKey +" "+ instructionKey ] === 'undefined')
							cache.remap[ currentKey +" "+ instructionKey ] = [];

						cache.remap[ currentKey +" "+ instructionKey ]
						.push( instructions['this'] +" "+ instructionKey );
					} else {
						if (typeof cache.remap[ instructionKey ] === 'undefined')
							cache.remap[ instructionKey ] = [];

						cache.remap[ instructionKey ]
						.push( instructions['this'] +" "+ instructionKey );
					}
				}
			}


			 //
			// Left-hand key after an explicit remap

			if (instructions['remap'] && !isInlineRemap(instructionKey) && instructionKey !== 'remap' && !instructions['this']) {
				if (cache.currentObjects) {
					if (currentKey) {
						if (typeof cache.remap[ currentKey +" "+ instructionKey ] === 'undefined')
							cache.remap[ currentKey +" "+ instructionKey ] = [];

						cache.remap[ currentKey +" "+ instructionKey ]
						.push( spaceBeforeDot(instructions['remap']) +" "+ instructionKey );
					} else {
						if (typeof cache.remap[ instructionKey ] === 'undefined')
							cache.remap[ instructionKey ] = [];

						cache.remap[ instructionKey ]
						.push( spaceBeforeDot(instructions['remap']) +" "+ instructionKey );
					}
				}
			}


			if (instructionKey !== 'remap') {
				if (isInlineRemap(instructionKey)) {
					instructionKey = getRemapKeys(instructionKey)[0]; // ... resolved already

				} else {
					objectRef = arrayLastItem(Object.keys(cache.currentObjects));
					if (objectRef) {
						if (currentKey) {
							if (typeof cache.remap[ currentKey +" "+ instructionKey ])
								cache.remap[ currentKey +" "+ instructionKey ] = [];

							if (cache.currentObjects[ objectRef ]) {
								cache.remap[ currentKey +" "+ instructionKey ]
								.push( objectRef +" "+ flattenPath(cache.currentObjects[objectRef]) +" "+ instructionKey );
							} else {
								cache.remap[ currentKey +" "+ instructionKey ]
								.push( objectRef +" "+ instructionKey );
							}
						} else {
							if (typeof cache.remap[ instructionKey ])
								cache.remap[ instructionKey ] = [];

							if (cache.currentObjects[ objectRef ]) {
								cache.remap[ instructionKey ]
								.push( objectRef +" "+ flattenPath(cache.currentObjects[objectRef]) +" "+ instructionKey );
							} else {
								cache.remap[ instructionKey ]
								.push( objectRef +" "+ instructionKey );
							}
						}
					}
				}


				 //
				// Right-hand object contains a schema definition

				if (typeof object === 'string') {
					if (currentKey)
						var objectPath = transformToPath(currentKey +" "+ instructionKey, [validateType(object)]);
					else
						var objectPath = transformToPath(instructionKey, [validateType(object)]);

					cache.pathTree = mergePathTree(cache.pathTree, objectPath);
					return;
				}

				if (typeof object === 'function') {
					if (currentKey)
						var objectPath = transformToPath(currentKey +" "+ instructionKey, [object]);
					else
						var objectPath = transformToPath(instructionKey, [object]);

					cache.pathTree = mergePathTree(cache.pathTree, objectPath);
					return;
				}


				 //
				// Right-hand object can be of any type

				if (object === null) {
					if (currentKey)
						var objectPath = transformToPath(currentKey +" "+ instructionKey, [null]);
					else
						var objectPath = transformToPath(instructionKey, [null]);

					cache.pathTree = mergePathTree(cache.pathTree, objectPath);
					return;
				}
			}


			 //
			// Left-hand conditional keys with struct objects
			if (typeof object === 'object' && 
			    '_' == instructionKey.charAt(0)) {

				if (conditionalKey.includes(instructionKey)) {
					if (currentKey)
						var objectPath = transformToPath(currentKey +" "+ instructionKey, object);
					else
						var objectPath = transformToPath(instructionKey, object);

					cache.pathTree = mergePathTree(cache.pathTree, objectPath);
					return;
				}
			}
		});


		 //
		// Closure after looping through properties at the current depth (clean-up)

		if (instructions['this']) {
			delete cache.currentObjects[ instructions['this'] ];
		}

		var currentObjectsKeys = Object.keys(cache.currentObjects);
		currentObjectsKeys.forEach((key) => {

			cache.currentObjects[key] = popLastPathItem({
				[key]: cache.currentObjects[key]
			});

		})
	}
}



/*

  # Utilities

    */


var isInlineRemap = (key) => { 
	return (key.indexOf('=>') !== -1) ? true : false 
}

var isDeep = (key) => { 
	return (key.indexOf(' ') !== -1) ? true : false 
}

var removeDotPrefix = (key) => {
	if (key.charAt(0) == '.') {
		key = key.substring(1)
	}
	return key.replaceAll(" .", " ");
}



 //
// Generate path tree from key format

var transformToPath = function (key, object = undefined) {

	if (key.indexOf('=>') > 0)
		return false;

	if (key.indexOf('this') > 0)
		return false

	// if (object && typeof object !== 'object')
	//	return false;

	var keys = key.split(' ').reverse(),
	    path = null;

	keys.forEach((instruction) => {

		if (path) {
			path = {
				[instruction]: path
			}
		} else {
			if (object !== undefined) {
				path = {
					[instruction]: object
				}
			} else {
				path = instruction
			}
		}
	})

	return path
}



 //
// Flatten a singular path object into a key form

var flattenPath = function (pathObject) {

	if (typeof pathObject === 'object') {
		var objectKey = Object.keys(pathObject)

		if (typeof pathObject[objectKey[0]] !== 'undefined' && pathObject[objectKey[0]] !== null)
			return removeDoubleSpace(objectKey[0] +" "+ flattenPath(pathObject[objectKey[0]])).trim();
		else
			return objectKey[0]

	} else {
		if (pathObject !== 'undefined' && pathObject !== 'null')
			return pathObject;
	}
}



 //
// Merge paths as tree objects

var mergePathTree = function (pathTree, mergePath) {

	var keys = Object.keys(mergePath);

	if (isObject(pathTree) && typeof pathTree[ keys[0] ] !== 'undefined') {
		if (!isArray(pathTree[ keys[0] ])) {

			pathTree[ keys[0] ] = { 
				...pathTree[ keys[0] ], 
				...mergePathTree(pathTree[ keys[0].trim() ], mergePath[ keys[0].trim() ]) 
			};
			return pathTree;
		}

		if (isArray(pathTree[ keys[0] ]) && isArray(mergePath[ keys[0] ])) {
			return {
				[keys[0]]: pathTree[keys[0]].concat(mergePath[keys[0]])
			}
		}
	}


	return mergePath
}



 //
// Merge an object into a singular path at leaf

var mergeDistinctPaths = function (rootPath, mergeObj) {

	if (typeof rootPath === 'object' && rootPath !== null){
		var keys = Object.keys(rootPath);

		if (keys.length) {
			return {
				[keys[0]]: mergeDistinctPaths(rootPath[keys[0]], mergeObj)
			}
		}

	} else {

		if (rootPath !== null) {
			return {
				[rootPath]: mergeObj
			}
		} else
			return mergeObj;
	}
}



 //
// Remove leaf from a singular path

var popLastPathItem = function (path) {

	if (typeof path === 'object') {
		var key = Object.keys(path),
				processed = popLastPathItem(path[key])

		if (path[key] === 'object' && processed === 'object') {
			return {
				[key]: processed
			}
		} 

		if (path[key] === 'object' && processed === 'string') {
			return {
				[key]: processed
			}
		}

		if (typeof path[key] !== 'undefined') {
			return key
		}
	}
}



//
// Split a path in key form after first item

var popFirstKeyItem = function (key) {
	var firstSpace = key.indexOf(" ");
	if (firstSpace) {
		return [key.substring(0, firstSpace), key.substring(firstSpace+1)]
	}
}


var popLastKeyItem = function (key) {
	var lastSpace = key.lastIndexOf(" ");
	if (lastSpace) {
		return [key.substring(lastSpace+1), key.substring(0, lastSpace+1)]
	}
}



 //
// Deep remapping key sets an instruction to traverse and remap

var getRemapKeys = function (key) {
	var remap = key.split('=>')

	if (remap.length == 2) {
		remap[0] = remap[0].trim();
		remap[1] = remap[1].trim();

		return [remap[0], remap[1]];

	} else 
		return false;
}



 //
// Remapping key contains a reference to a declared object

var getObjectRef = function (key) {

	if (key) {
		var test_1 = key.match(/^([a-zA-Z]+)(?:\s|\.)/);

		if (test_1) {
			if (typeof test_1['1'] !== 'undefined')
				return test_1[1];
			else
				return false;
		} else {
			return false;
		}

	} else {
		return false;
	}
}



 //
// Space before dot (before parsing)

var spaceBeforeDot = function (key) {
	return removeDoubleSpace(key.replace(".", " ."));
}



 //
// List of variables, embedded in string

var getEmbeddedVars = function (string) {
	var regex = /.*\{(.*)\}.*/,
	    match = string.match(regex),
	    found = [],
	    last;

	while (match != null && typeof match[1] !== 'undefined') {
		last = match[1];
		found.push(match[1]);

		string = string.replace("{"+last+"}", "");
		match = string.match(regex)
	}

	return found;
}




 //
// Auxiliary

var isArray = function (object) {
	if(Object.prototype.toString.call(object) === '[object Array]') {
    return true;
	} else {
		return false;
	}
}


var isObject = function (object) {
	if(Object.prototype.toString.call(object) === '[object Object]') {
    return true;
	} else {
		return false;
	}
}


var isNumber = function (object) {
	var res = object / 1;
	if (Number.isInteger(res))
		return true
	else
		return false;
}


var removeArrayItem = function (array, key) {
	var index = array.indexOf(key);

  if (index > -1) {
    return array.splice(index, 1);
  } else {
  	return false;
  }
}


var arrayLastItem = function (array) {
	if (array.length == 1) {
		return array[0];
	}
	if (array.length > 1) {
		return array[-1];
	}
	return false;
}


var removeDoubleSpace = function (string) {
	var condition = false,
	    length = string.length;

	while (condition !== true) {
		string = string.replace("  ", " ");

		if(string.length == length)
			condition = true;
	}

	return string.trim();
}



/*

  # Validators
  
    */

const validateType = function (type) {
	return (value) => {
		if (typeof value === type)
			return value
		else
			return false
	}
}