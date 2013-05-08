###
Local in memory indexes drive full text search and tagging.
###
define ['angular',
    'cs!src/inverted/inverted',
    'lunr',
    'cs!./root'], (angular, inverted, lunr, root) ->
        root.factory 'LocalIndexes', ->
            #parsing functions to keep track of all links and tags
            parseTags = (document, callback) ->
                for tag, v of (document?.tags or {})
                    callback tag
            parseLinks = (document, callback) ->
                for link, v of (document?.links or {})
                    callback link
            #inverted indexing for tags
            tagIndex = inverted.index [parseTags], (x) -> x.id
            #inverted indexing for links
            linkIndex = inverted.index [parseLinks], (x) -> x.id
            #full text index for searchacross items
            fullTextIndex = lunr ->
                @field 'what', 8
                @field 'who', 4
                @field 'tags', 2
                @field 'comments', 1
                @ref 'id'
            fullTextIndex.addToIndex = (item) ->
                fullTextIndex.update
                    id: item.id or ''
                    what: item.what or ''
                    who: _.keys(item.links).join ' '
                    tags: (_.keys(item.tags).join ' ') or ''
                    comments: (_.map(
                        item?.discussion?.comments,
                        (x) -> x.what).join ' ') or ''
            do ->
                update: (item) ->
                    #indexing to drive the tags, autocomplete, and screens
                    tagIndex.add item
                    linkIndex.add item
                    fullTextIndex.addToIndex item
                delete: (item) ->
                    tagIndex.remove item
                    linkIndex.remove item
                    fullTextIndex.remove
                        id: item.id
                tags: (filter) ->
                    tagIndex.terms(filter)
                links: (filter) ->
                    linkIndex.terms(filter)
                itemsByTag: (tags, filter) ->
                    tagIndex.search(tags, filter)
                fullTextSearch: (query) ->
                    fullTextIndex.search(query)