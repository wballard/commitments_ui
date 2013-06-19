(function ($, undefined) {
  "use strict";
  if (window.tagbar !== undefined) {
    return;
  }

  function makeATag(data, opts) {
    data = data || '';
    opts = opts || $.fn.tagbar.defaults;
    var item = null;
    //this is the main tag display
    if (opts.listItem) {
      var item = $("<li class='tagbar-search-choice'></li>");
    } else {
      var item = $("<span class='tagbar-search-choice'></span>");
    }
    //just a display item, likely to be a gravatar, this is separate from
    //the tag, it will be shown by itself for compactness
    if (opts.iconUrl) {
      var url = opts.iconUrl(data);
      if (url) {
        var icon = $("<image class='tagbar-search-choice-icon' src='" + url + "'/>");
        item.append(icon);
      }
    }
    //here is the container for the content
    //status icons show a bit more than just a display item
    var display = $("<span class='tagbar-search-choice-display'/>");
    if (opts.statusIcon) {
      var statusIcon = $(opts.statusIcon(data));
      statusIcon.addClass('tagbar-status-icon');
      display.append(statusIcon);
    }
    var content = "";
    if (opts.tagUrl && (typeof(opts.tagUrl) === 'function') && opts.tagUrl(this)) {
      content = "<a href='" + opts.tagUrl(data) + "' class='tagbar-search-choice-text'>" + data + "</a>";
    } else if (opts.tagUrl) {
      content = "<a href='" + opts.tagUrl + "' class='tagbar-search-choice-text'>" + data + "</a>";
    } else {
      content = "<span class='tagbar-search-choice-text'>" + data + "</span>";
    }
    if (content) {
      label = $("<span class='tagbar-search-choice-label'>" + content + "</span>");
      display.append(label)
    }
    if (opts.allowClose && label) {
      var closer = $("<span class='closer tagbar-search-choice-close icon-remove-sign'></span>");
      display.append(closer);
    }
    if (icon) {
        display.addClass('tagbar-search-choice-icon-only');
    }
    item.append(display);
    item.hover( function(){
        item.find('*').addClass('hover');
    }, function(){
        item.find('*').removeClass('hover');
    });
    return item;
  }

  var KEY = {
    TAB: 9,
    ENTER: 13,
    ESC: 27,
    SPACE: 32,
    LEFT: 37,
    UP: 38,
    RIGHT: 39,
    DOWN: 40,
    SHIFT: 16,
    CTRL: 17,
    ALT: 18,
    PAGE_UP: 33,
    PAGE_DOWN: 34,
    HOME: 36,
    END: 35,
    BACKSPACE: 8,
    DELETE: 46
  };

  function indexOf(value, array) {
    var i = 0, l = array.length;
    for (; i < l; i = i + 1) {
      if (equal(value, array[i])) return i;
    }
    return -1;
  }

  function equal(a, b) {
    if (a === b) return true;
    if (a === undefined || b === undefined) return false;
    if (a === null || b === null) return false;
    if (a.constructor === String) return a === b+'';
    if (b.constructor === String) return b === a+'';
    return false;
  }

  function killEvent(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function killEventImmediately(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function evaluate(val) {
    return $.isFunction(val) ? val() : val;
  }

  function TagBar(){ return {
    measureTextWidth: function(e, force) {
      if (e.text().length == 0 && !force)  return 0;
      var style = e[0].currentStyle || window.getComputedStyle(e[0], null);
      this.sizer.css({
        position: "absolute",
        left: "-10000px",
        top: "-10000px",
        display: "none",
        margin: style.margin,
        padding: style.padding,
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        fontStyle: style.fontStyle,
        fontWeight: style.fontWeight,
        letterSpacing: style.letterSpacing,
        textTransform: style.textTransform,
        whiteSpace: "nowrap"
      });
      this.sizer.text(e.text() + '__');
      return this.sizer.width();
    },
    bind: function (func) {
      var self = this;
      return function () {
        func.apply(self, arguments);
      };
    },
    init: function (opts) {
      // prepare options
      this.opts = opts = this.prepareOpts(opts);
      this.id=opts.id;
      // destroy if called on an existing component
      if (opts.element.data("tagbar") !== undefined &&
          opts.element.data("tagbar") !== null) {
        this.destroy();
      }
      this.enabled=true;
      this.container = this.createContainer();
      this.sizer = this.container.append($("<div class='sizer'/>")).find(".sizer");
      this.elementTabIndex = this.opts.element.attr("tabIndex");
      this.opts.element.data('tagbar', this).append(this.container);
      this.search = this.container.find(".tagbar-search-field");
      //forward the tab index, this makes it a lot friendlier for full on
      this.search.attr("tabIndex", this.elementTabIndex);
      this.initContainer();
      if (opts.element.is(":disabled") || opts.element.is("[readonly='readonly']")) this.disable();
      this.opts.element.trigger('initialized');
    },
    destroy: function () {
      this.container.remove();
    },
    populateResults: function(results, query) {
      var tagbar = this;
      var addTo = this.container.find(".tagbar-results");
      //clear out and replace all the results
      addTo.children().remove();
      for (var i = 0; i < results.length; i = i + 1) {
        var result=results[i];
        var node=$("<li class='tagbar-result'></li>");
        var item=$("<a></a>");
        if (this.opts.iconUrl) {
          var url = this.opts.iconUrl(result);
          if (url) {
            icon = $("<image class='tagbar-result-icon' src='" + url + "'/>");
            item.append(icon);
          }
        }
        var label=$(document.createElement("span"));
        label.addClass("tagbar-result-label");
        label.html(result);
        item.append(label);
        node.append(item);
        node.data("tagbar-data", result);
        node.data("tagbar-index", i);
        node.hover( function (){
            tagbar.highlight($(this).data("tagbar-index"));
        });
        node.click( function (){
            tagbar.onSelect($(this).data("tagbar-data"));
        });
        addTo.append(node);
      }
    },
    prepareOpts: function (opts) {
      var element, select, idKey;
      element = opts.element;
      //global an instance options
      opts = $.extend({}, $.fn.tagbar.defaults, opts);
      if (typeof(opts.query) !== "function") {
        throw "query function not defined" + opts.element.attr("id");
      }
      return opts;
    },
    triggerChange: function (details) {
      // prevents recursive triggering
      if(this.opts.element.data("tagbar-change-triggered")) return;
      details = details || {};
      details= $.extend({}, details, { type: "change", val: this.val() });
      this.opts.element.data("tagbar-change-triggered", true);
      this.opts.element.trigger(details);
      this.opts.element.data("tagbar-change-triggered", false);
    },
    enable: function() {
      if (this.enabled) return;
      this.enabled=true;
      this.container.removeClass("tagbar-container-disabled");
    },
    disable: function() {
      if (!this.enabled) return;
      this.close();
      this.enabled=false;
      this.container.addClass("tagbar-container-disabled");
    },
    opened: function () {
      return this.container.find(".tagbar-results").length;
    },
    open: function () {
      if (this.search.text().length == 0) return false;
      this.container.find(".tagbar-results").show();
    },
    close: function () {
      this.container.find(".tagbar-results").hide();
    },
    clear: function () {
      this.close();
      this.populateResults([]);
      this.search.text("");
      this.resizeSearch();
      this.container.find('*').removeClass('focus');
    },
    ensureHighlightVisible: function () {
      var results = this.container.find(".tagbar-results");
      var children, index, child, hb, rb, y, more;
      index = this.highlight();
      if (index < 0) return;
      if (index == 0) {
        // if the first element is highlighted scroll all the way to the top,
        // into view
        results.scrollTop(0);
        return;
      }
      children = this.findHighlightableChoices();
      child = $(children[index]);
      hb = child.offset().top + child.outerHeight(true);
      rb = results.offset().top + results.outerHeight(true);
      if (hb > rb) {
        results.scrollTop(results.scrollTop() + (hb - rb));
      }
      y = child.offset().top - results.offset().top;
      // make sure the top of the element is visible
      if (y < 0 && child.css('display') != 'none' ) {
        results.scrollTop(results.scrollTop() + y); // y is negative
      }
    },
    findHighlightableChoices: function() {
      return this.container.find(".tagbar-result");
    },
    moveHighlight: function (delta) {
      this.highlight(this.highlight() + delta);
    },
    highlight: function (index) {
      var choices = this.findHighlightableChoices(),
      choice,
      data;
      if (arguments.length === 0) {
        return indexOf(choices.filter(".tagbar-highlighted")[0], choices.get());
      }
      if (index >= choices.length) index = choices.length - 1;
      if (index < 0) index = 0;
      $(".tagbar-highlighted", this.container).removeClass("tagbar-highlighted");
      choice = $(choices[index]);
      choice.addClass("tagbar-highlighted");
      this.ensureHighlightVisible();
      data = choice.data("tagbar-data");
      if (data) {
        this.opts.element.trigger({ type: "highlight", val: data, choice: data });
      }
    },
    updateResults: function () {
      var text = this.search.text().trim();
      if (text.length == 0) {
        //you may have a string of spaces, so clean it up
        this.search.text('');
        return;
      }
      //try to pull out a parseable tag
      var pattern = new RegExp("[" + this.opts.tagSeparators.join("") + "]+", "g");
      if (text.match(pattern)) {
        this.addSelectedChoice(text.split(pattern)[0]);
        this.clear();
        return;
      }
      //now in a query
      this.search.addClass("tagbar-active");
      this.opts.query({
        control: this,
        term: text,
        callback: this.bind(function (data) {
          this.populateResults(data.results, {term: text});
          this.ensureSomethingHighlighted();
          this.search.removeClass("tagbar-active");
        })});
    },
    deferBlur: function () {
      //defer blur, as elements may be hidden, this is a nice trick as
      //mousedown > blur > mouseup > click this.shouldDeferBlur = true;
      this.shouldDeferBlur = true;
    },
    blur: function () {
      if (this.shouldDeferBlur) {
      } else {
        this.clear();
      }
      //this is a one time counter and is now consumed
      this.shouldDeferBlur = false;
    },
    focusSearch: function () {
      if (this.enabled) {
        this.search.focus()
        this.resizeSearch(true);
      }
    },
    selectHighlighted: function () {
      var highlighted = $(".tagbar-highlighted", this.container),
      data = highlighted.closest('.tagbar-result').data("tagbar-data");
      if (data) {
        this.onSelect(data)
      }
    },
    createContainer: function () {
      var container = $(document.createElement("div")).attr({
        "class": "tagbar-container tagbar-container-multi"
      }).html([
        "<ul class='tagbar-choices'>",
        "  <li class='tagbar-search-field' contentEditable>" ,
        "  </li>",
        "</ul>",
        "<ul class='tagbar-results dropdown-menu'>",
        "</ul>",
        ].join(""));
        return container;
    },
    initContainer: function () {
      this.search.bind("keydown", this.bind(function (e) {
        //if we are opened, key sequences that navigate selected items
        if (this.opened()) {
          switch (e.which) {
            case KEY.UP:
            case KEY.DOWN:
              this.moveHighlight((e.which === KEY.UP) ? -1 : 1);
              killEvent(e);
              return;
            case KEY.ENTER:
            case KEY.TAB:
              if (this.search.text() === "") {
                this.search.blur();
              } else {
                this.selectHighlighted();
              }
              killEvent(e);
              return;
            case KEY.ESC:
              this.cancel(e);
              this.search.blur();
              killEvent(e);
              return;
            case KEY.BACKSPACE:
              if (this.search.text() === "") {
                this.close();
              }
              return;
          }
        } else {
          //and when we are closed, key sequences that just exit the field
          switch (e.which) {
            case KEY.ESC:
            case KEY.ENTER:
              this.search.blur();
              killEvent(e);
              return;
          }
        }
      }));
      this.search.bind("input paste focus", this.bind(this.updateResults));
      this.search.bind("input paste focus", this.bind(this.open));
      this.search.bind("blur", this.bind(this.blur));
      this.search.bind("input paste focus", this.bind(this.resizeSearch));
      this.search.bind("focus", this.bind(this.resizeSearch));
      this.container.bind("click", this.bind(this.focusSearch));
      this.container.on("mousedown", ".tagbar-search-choice", this.bind(this.deferBlur));
      this.clear()
    },
    focus: function () {
      this.shouldDeferBlur = false;
      this.focusSearch()
      this.opts.element.triggerHandler("focus");
    },
    onSelect: function (data) {
      this.addSelectedChoice(data);
      this.cancel();
    },
    cancel: function () {
      this.clear();
      this.focusSearch();
    },
    addSelectedChoice: function (data, value, supressChange) {
      var item = makeATag(data, this.opts);
      item.find('.closer').bind("click dblclick", this.bind(function (e) {
        $(e.target).closest(".tagbar-search-choice").fadeOut('fast', this.bind(function(){
          $(e.target).parent(".tagbar-search-choice").remove();
          delete this.values[data];
          this.clear();
          this.triggerChange();
          this.focus();
        })).dequeue();
        killEvent(e);
      }));
      item.insertBefore(this.search);
      this.values[data] = value || Date.now();
      if (!supressChange) {
        this.triggerChange();
      }
    },
    ensureSomethingHighlighted: function () {
      if (this.highlight() == -1){
        this.highlight(0);
      }
    },
    resizeSearch: function (force) {
      var width = this.measureTextWidth(this.search, force);
      this.search.width(width).show();
      //this seems like an odd place to put this, but it avoids a focus
      //infinte loop
      this.container.find('*').addClass('focus');
    },
    val: function (data) {
      if (arguments.length === 0) return this.values || {};
      var self = this;
      //the actual data needs to be cleared out, will be filled in
      //by adding selected choices
      this.values = {};
      $(".tagbar-search-choice", this.container).remove();
      //now add in all the items, forgiving the input as an array
      if (Array.isArray(data)) {
        $(arguments[0]).each(function () {
          self.addSelectedChoice(this, Date.now(), true);
        });
      } else {
        for (var tag in data){
          self.addSelectedChoice(tag, arguments[0][tag], true);
        }
      }
    },
  };}
  $.fn.tagbar = function () {
    var args = Array.prototype.slice.call(arguments, 0),
    opts,
    value, allowedMethods = ["focusSearch", "val", "destroy", "opened", "open", "close", "focus", "container", "enable", "disable"];
    this.each(function () {
      if (args.length === 0 || typeof(args[0]) === "object") {
        opts = args.length === 0 ? {} : $.extend({}, args[0]);
        opts.element = $(this);
        opts.listItem = true;
        new TagBar().init(opts);
      } else if (typeof(args[0]) === "string") {
        if (indexOf(args[0], allowedMethods) < 0) {
          throw "Unknown method: " + args[0];
        }
        value = undefined;
        var tagbar = $(this).data("tagbar");
        if (args[0] === "container") {
          value=tagbar.container;
        } else {
          value = tagbar[args[0]].apply(tagbar, args.slice(1));
        }
        if (value !== undefined) {return false;}
      } else {
        throw "Invalid arguments to plugin: " + args;
      }
    });
    return (value === undefined) ? this : value;
  };
  // plugin defaults, accessible to users
  $.fn.tagbar.defaults = {
    minimumInputLength: 0,
    maximumInputLength: 128,
    tagSeparators: [',', ';'],
    allowClose: true,
    iconOnly: false
  };
  // plugin to make just one tag
  $.fn.onetag = function(data, passedOptions) {
      var opts = $.extend({}, $.fn.tagbar.defaults, passedOptions);
      opts.allowClose = false;
      this.empty().append(makeATag(data, opts));
  };
}(jQuery));
