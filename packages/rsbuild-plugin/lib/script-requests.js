const addQuery = require('@mpxjs/webpack-plugin/lib/utils/add-query')
const parseRequest = require('@mpxjs/webpack-plugin/lib/utils/parse-request')
const { matchCondition } = require('@mpxjs/webpack-plugin/lib/utils/match-condition')

function getAsyncRequest (request, rules) {
  const { queryObj, resourcePath } = parseRequest(request)
  const root = queryObj.root || rules?.find(rule => matchCondition(resourcePath, rule))?.root
  return { root, request: queryObj.root ? addQuery(request, {}, false, ['root']) : request }
}

function getResolveRequest (request) {
  if (request.includes('?') && parseRequest(request).queryObj.resolve) {
    return addQuery(request, {}, false, ['resolve'])
  }
}

module.exports = { getAsyncRequest, getResolveRequest }
