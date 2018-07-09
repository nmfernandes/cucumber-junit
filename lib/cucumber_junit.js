var xml = require('xml');

/**
 * Creates a <property> element with the given name and value
 *
 * @method createProperty
 * @param  {String} name    <property>'s name attribute
 * @param  {String} value   <property>'s value attribute
 * @return {Object}         The <property> element
 */
function createProperty(name, value) {
    return {
        property: [{
            _attr: {
                name: name,
                value: value
            }
        }]
    };
}

/**
 * Creates a <failure> element with an failure message
 *
 * @method createFailure
 * @param message           result.error_message or result.status
 * @returns {Object}        The <failure> element
 */
function createFailure(message) {
    return {
        failure: [ { _attr: { 
				message: message.split("\n").shift(),
				type: message.split(" ")[0]
			} },
            message
        ]
    };
}

/**
 * Convert a step from Cucumber.JS into <testcase> XML
 *
 * @method convertStep
 * @param  {Object}    stepJson     Step output from Cucumber.JS
 * @param  {Object}    scenarioJson Scenario output from Cucumber.JS
 * @param  {Object}    options      if `strict` is true, pending or undefined steps will be reported as failures
 * @return {Array}                  Array of elements for an XML element <testcase>
 */
function convertStep (stepJson, scenarioJson, options) {
    var stepOutput = [{
            _attr: {
                name: stepJson.keyword + stepJson.name,
                classname: scenarioJson.id
            }
        }];

    // Convert from nanosecond to seconds
    stepOutput[0]._attr.time = stepJson.result.duration ? (stepJson.result.duration / 1000) : 0;

    switch (stepJson.result.status) {
        case 'passed':
            break;
        case 'failed':
            stepOutput.push(createFailure(stepJson.result.error_message));
            break;
        case 'pending':
        case 'undefined':
            if (options.strict) {
                stepOutput.push(createFailure(stepJson.result.status == 'pending' ? 'Pending' :
                    'Undefined step. Implement with the following snippet:\n' +
                    '  this.' + stepJson.keyword.trim() + '(/^' + stepJson.name + '$/, function(callback) {\n' +
                    '      // Write code here that turns the phrase above into concrete actions\n' +
                    '      callback(null, \'pending\');\n' +
                    '  });'
                ));
                break;
            }
        // else fall through
        case 'skipped':
            stepOutput.push({
                skipped: [
                    {
                        _attr: {
                            message: ""
                        }
                    }
                ]
            });
            break;
    }
    return stepOutput;
}


/**
 * Convert a scenario from Cucumber.JS into an XML element <testsuite>
 *
 * @method convertScenario
 * @param  {Object}    scenarioJson Scenario output from Cucumber.JS
 * @param  {Object}    featureJson 
 * @param  {Object}    options      if `strict` is true, pending or undefined steps will be reported as failures
 * @return {Array}                  Array of elements for an XML element <testsuite>
 */
function convertScenario (scenarioJson, featureJson, options) {
    var scenarioOutput = [{
            _attr: {
                name: scenarioJson.name,
                classname: featureJson.name,
                time: 0 // "Time taken (in seconds) to execute the test",
            }
        }, {
            properties: []
    }];
	
	if(scenarioJson.tags) {
        scenarioJson.tags.forEach(function (tagJson) {
            var tag = (typeof tagJson == "string" ? tagJson : tagJson.name);
            scenarioOutput[1].properties.push(createProperty(tag, true));
        });
    }
	
    if(scenarioJson.steps) {
		
        scenarioJson.steps.forEach(function (stepJson) {
            var step = convertStep(stepJson, scenarioJson, options);
			
            // Check for failures and increment the failure rate
            if (step[1] && step[1].failure) {

				scenarioOutput.push(createFailure(stepJson.result.error_message));
            }
			
            scenarioOutput[0]._attr.time += step[0]._attr.time;

        });
		
    }

    return { testcase: scenarioOutput };
}

/**
 * Calls `convertScenario` for each element
 */
function convertFeature(featureJson, options) {

	var testSuiteOutput = [{
            _attr: {
				name: featureJson.name,
                package: featureJson.name,
                id: featureJson.id,
				timestamp: featureJson.mock ? "--" : (new Date()).toUTCString(),
				hostname: "localhost",
				tests: featureJson.elements.length,
                failures: 0,
				// We are not differentiating between failures and errors
                errors: 0,
				time: 0
                }
        }, {
            properties: []
    }];
	
	if(featureJson.tags) {
        featureJson.tags.forEach(function (tagJson) {
            var tag = (typeof tagJson == "string" ? tagJson : tagJson.name);
            testSuiteOutput[1].properties.push(createProperty(tag, true));
        });
    }
	
	featureJson.elements.forEach(function (scenarioJson) {
		var scenario = convertScenario(scenarioJson, featureJson, options);
		
		testSuiteOutput[0]._attr.time += scenario.testcase[0]._attr.time;
		
		if (scenario.testcase[1] && scenario.testcase[1].failure) {
			testSuiteOutput[0]._attr.failures += 1;
		}
		
		testSuiteOutput.push(scenario);
	});	
		
	return { testsuite: testSuiteOutput };
	
}

/**
 * options:
 *  - indent - passed to the XML formatter, defaults to 4 spaces
 *  - stream - passed to the XML formatter
 *  - declaration - passed to the XML formatter
 *  - strict - if true, pending or undefined steps will be reported as failures
 *
 * @method exports
 * @param  {string} cucumberRaw  the Cucumber JSON report
 * @param  {object=} options     eg: {indent: boolean, strict: boolean, stream: boolean, declaration: {encoding: 'UTF-8'}}
 * @return {string} the JUnit XML report
 */
function cucumberJunit (cucumberRaw, options) {
    var cucumberJson;
    var output = [];
    options = options || {};
    if (options.indent === undefined) {
        options.indent = '    ';
    }

    if (cucumberRaw && cucumberRaw.toString().trim() !== '') {
        cucumberJson = JSON.parse(cucumberRaw);
        cucumberJson.forEach(function (featureJson) {
            output = output.concat(convertFeature(featureJson, options));
        });

        // If no items, provide something
        if (output.length === 0) {
            output.push( { testsuite: [] } );
        }
    }

    // wrap all <testsuite> elements in <testsuites> element
    return xml({ testsuites: output }, options);
};

module.exports = cucumberJunit;
