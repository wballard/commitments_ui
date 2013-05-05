define ['angular',
    'lodash',
    'socketio',
    'store',
    'cs!src/inverted/inverted',
    'lunr',
    'cs!src/sampledata',
    'cs!src/samplenotifications',
    ], (angular, _, socketio, store, inverted, lunr, sampledata, samplenotifications) ->
    #fake server, this will fire off a lot of events and generally stress
    #you out while debugging
    window.FAKE_SERVER = false
    window.LIVE = true
    module = angular.module('RootServices', [])
        #deal with figuring out who is who
        .factory 'User', ($rootScope) ->
            $rootScope.sampleUsers =
                'wballard@glgroup.com': 'xxx'
                'igroff@glgroup.com': 'yyy'
                'kwokoek@glgroup.com': 'zzz'
            user =
                email: ''
                authtoken: ''
                preferences:
                    bulkShare: false
                    server: "http://#{window.location.host}/"
                    notifications: false
                    notificationsLRU: 20
                loggedIn: ->
                    user.email and user.authtoken
                persistentLogin: ->
                    identity = store.get 'identity'
                    identity and identity.authtoken
                persistentIdentity: (identity) ->
                    if identity
                        store.set 'identity', identity
                        user.email = identity.email
                        user.authtoken = identity.authtoken
                    store.get 'identity'
                clear: ->
                    store.remove 'identity'
                    user.email = null
                    user.authtoken = null
            user
        .factory 'LocalIndexes', ->
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
        .factory 'Notifications', ($rootScope, $timeout, User) ->
            #items are kept in an LRU buffer
            items = []
            received_items = []
            receive = (message) ->
                received_items.push message
                if received_items.length > User.preferences.notificationsLRU
                    received_items.shift()
            deliver = (message) ->
                items.push message
                if items.length > User.preferences.notificationsLRU
                    items.shift()
            do ->
                unreadCount: ->
                    len = _.keys(received_items).length
                    #This will ba a blank, not a zero
                    len unless not len
                receiveMessage: (message) ->
                    $rootScope.$broadcast 'notification', message
                    if User.preferences.notifications
                        deliver message
                    else
                        receive message
                deliverMessages: ->
                    #move items away from being freshly received
                    for item in received_items
                        deliver item
                    received_items = []
                    items
                items: items
                clear: ->
                    items.splice()
                    received_items.splice()
        #deal with sample data for local testing
        .factory 'SampleData', ($rootScope, $timeout) ->
            (taskFromServer, deleteTaskFromServer, notification, authtoken) ->
                console.log "no server, going for sample data"
                #this is a very fake login token system
                fakeAuth =
                    xxx: 'wballard@glgroup.com'
                #yes, I really do mean to assign here
                if email = fakeAuth[authtoken]
                    $rootScope.$broadcast 'login',
                        authtoken: authtoken
                        email: email
                    #here is some nice fake sample data, but only if we got
                    #a fake user, this is much like connecting to the server
                    #in that if we failed to authenticate, there would be
                    #no messages
                    for item in sampledata
                        cloneFromItem = item
                        taskFromServer item
                    for item in samplenotifications
                        notification item
                    fakeCount = 0
                    fakeDeleteCount = 0
                    fakeCommentCount = 0
                    lastAddedId = null
                    id = sampledata[sampledata.length-1].id
                    fakeUpdate = ->
                        $timeout ->
                            if not FAKE_SERVER
                                #no action
                            else
                                #this is making a lot of noise realy to see how
                                #the user interface responds to simulated messages
                                fakeServerUpdate = _.cloneDeep cloneFromItem
                                fakeServerUpdate.what = "Simulated event update #{Date.now()}"
                                if fakeCommentCount++ < 10
                                    fakeServerUpdate.discussion.comments.push
                                        who: 'igroff@glgroup.com'
                                        when: new Date().toDateString()
                                        what: "Simulated comment #{Date.now()}"
                                if fakeCount++ < 5
                                    fakeServerUpdate.tags["Tag #{fakeCount}"] = Date.now()
                                else
                                    if fakeDeleteCount++ < 5
                                        delete fakeServerUpdate.tags["Tag #{fakeDeleteCount}"]
                                    else
                                        fakeDeleteCount = 0
                                        fakeCount = 0
                                #an update
                                taskFromServer fakeServerUpdate
                                #delete the last add
                                deleteTaskFromServer
                                    id: lastAddedId
                                #a new task
                                lastAddedId = Date.now()
                                taskFromServer
                                    id: lastAddedId
                                    what: "Inserted #{Date.now()}"
                                    who: email
                                notification
                                    when: Date.now()
                                    data:
                                        message: "Hello there, I am a fresh notification #{Date.now()}"
                            fakeUpdate()
                        , 1000
                    fakeUpdate()
                else
                    $rootScope.$broadcast 'loginfailure'
        #deal with querying 'the database', really the services up in the cloud
        #** for the time being this is just rigged to pretend to be a service **
        .factory 'Database', ($rootScope, $timeout, Notifications, LocalIndexes, SampleData) ->
            #here is the 'database' in memory, items tracked by ID
            items = {}
            opCount = 0
            updateItem = (item, fromServer) ->
                if not fromServer
                    item.lastUpdatedBy = $rootScope.user.email
                    item.lastUpdatedAt = Date.now()
                #merge into the existing object, allowing the data binding
                #to be pointed at the same reference
                if items[item.id]
                    _.extend items[item.id], item
                else
                    items[item.id] = item
                if not fromServer
                    console.log 'update', item, items, 'a'
                else
                    $rootScope.$broadcast 'serverupdate', 'update', item
                opCount++
                LocalIndexes.update item
                item
            deleteItem = (item, fromServer) ->
                delete items[item.id]
                if not fromServer
                    console.log 'delete', item
                else
                    $rootScope.$broadcast 'serverupdate', 'delete', item
                opCount++
                LocalIndexes.delete item
                item
            #start talking to the server when we know who you are, this is
            #how data makes it into the system
            socket = null
            clear = ->
                items = {}
            join = (email) ->
                connection_string = "#{$rootScope.user.preferences.server}?authtoken=join:#{email}"
                console.log connection_string
                join_socket = socketio.connect connection_string,
                    'force new connection': true
                join_socket.on 'error', ->
                    join_socket.disconnect()
            login = (authtoken) ->
                #a new user, clean out the state
                clear()
                Notifications.clear()
                #only one connection is needed, or even a good idea :)
                if socket
                    try
                        socket.disconnect()
                    catch ex
                        do ->
                #start up the sequence to check an auth token for being a user
                if authtoken
                    #send in a server event into angular, these are the main
                    #methods for getting data from the socket
                    taskFromServer = (item) ->
                        if $rootScope.$$phase
                            updateItem item, true
                        else
                            $rootScope.$apply ->
                                updateItem item, true
                            $rootScope.$digest()
                    deleteTaskFromServer = (item) ->
                        if $rootScope.$$phase
                            deleteItem item, true
                        else
                            $rootScope.$apply ->
                                deleteItem item, true
                            $rootScope.$digest()
                    if LIVE
                        connection_string = "#{$rootScope.user.preferences.server}?authtoken=#{authtoken}"
                        console.log connection_string
                        socket = socketio.connect connection_string,
                            'force new connection': true
                        #event errors, go for the sample data
                        socket.on 'hello', (email) ->
                            $rootScope.$apply ->
                                $rootScope.$broadcast 'login',
                                    authtoken: authtoken
                                    email: email
                        socket.on 'error', ->
                            console.log 'socketerror', arguments
                            #this appears to be the message coming back from
                            #socket.io on an auth failure
                            if "#{arguments[0]}".indexOf('unauthorized') >= 0
                                $rootScope.$apply ->
                                    $rootScope.$broadcast 'loginfailure'
                        socket.on 'connect', ->
                            console.log 'connected', arguments, socket
                            #ask for the username, callback to login
                            ###
                            $rootScope.$broadcast 'login',
                                authtoken: authtoken
                                email: email
                            ###
                        socket.on 'disconnect', ->
                            $rootScope.$broadcast 'loginfailure'
                    else
                        SampleData taskFromServer, deleteTaskFromServer, Notifications.receiveMessage, authtoken
                else
                    $rootScope.$broadcast 'logout'
            #here is the database service construction function itself
            #call this in controllers, or really - just the root most controller
            #to get one database
            do ->
                items: (filter) ->
                    _.filter _.values(items), filter
                update: updateItem
                delete: deleteItem
                opCount: -> opCount
                tags: LocalIndexes.tags
                links: LocalIndexes.links
                itemsByTag: LocalIndexes.itemsByTag
                fullTextSearch: LocalIndexes.fullTextSearch
                login: login
                join: join
                logout: -> login null
        #
        .factory 'StackRank', () ->
            do ->
                #standardized sorting function, works to provide per user / per
                #tag stack ranking, with the when creation timestamp providing
                #the tiebreaker, meaning time sorted items go to the end as their
                #indexes are going to be a *lot* larger than 1..n
                sort: (list, user, tag) ->
                    user = user or '-'
                    tag = tag or '-'
                    extractIndex = (item) ->
                        item.when = item.when or Date.now()
                        idx = item?['sort']?[user]?[tag] or item.when
                        idx
                    _.sortBy(list, extractIndex)
                renumber: (list, user, tag) ->
                    index = 1
                    user = user or '-'
                    tag = tag or '-'
                    for item in list
                        item.sort = item.sort or {}
                        item.sort[user] = item.sort[user] or {}
                        item.sort[user][tag] = index++
