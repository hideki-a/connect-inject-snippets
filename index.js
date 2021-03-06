module.exports = function injectSnippets(opt) {
  // options
  var opt = opt || {};
  var ignore = opt.ignore || opt.excludeList || ['.js', '.css', '.svg', '.ico', '.woff', '.png', '.jpg', '.jpeg'];
  var html = opt.html || _html;
  var rules = opt.rules || [{
    match: /<\/body>/,
    fn: prepend
  }, {
    match: /<\/html>/,
    fn: prepend
  }, {
    match: /<\!DOCTYPE.+>/,
    fn: append
  }];
  var port = opt.port || 35729;
  var src = opt.src || "' + (location.protocol || 'http:') + '//' + (location.hostname || 'localhost') + ':" + port + "/livereload.js?snipver=1";
  var snippet = "\n<script type=\"text/javascript\">document.write('<script src=\"" + src + "\" type=\"text/javascript\"><\\/script>";
  
  if (opt.htmlInspector) {
    snippet += "<script src=\"http://cdnjs.cloudflare.com/ajax/libs/html-inspector/0.5.1/html-inspector.js\" type=\"text/javascript\"><\\/script><script>HTMLInspector.inspect(" + convertToText(opt.inspectorConfig) + ");<\\/script>";
  }
  snippet += "')</script>\n";

  // helper functions
  var regex = (function() {
    var matches = rules.map(function(item) {
      return item.match.source;
    }).join('|');

    return new RegExp(matches);
  })();

  function prepend(w, s) {
    return s + w;
  }

  function append(w, s) {
    return w + s;
  }

  function _html(str) {
    if (!str) return false;
    return /<[:_-\w\s\!\/\=\"\']+>/i.test(str);
  }

  function exists(body) {
    if (!body) return false;
    return regex.test(body);
  }

  function snip(body) {
    if (!body) return false;
    return (~body.lastIndexOf("/livereload.js"));
  }

  function snap(body) {
    var _body = body;
    rules.some(function(rule) {
      if (rule.match.test(body)) {
        _body = body.replace(rule.match, function(w) {
          return rule.fn(w, snippet);
        });
        return true;
      }
      return false;
    });
    return _body;
  }

  function accept(req) {
    var ha = req.headers["accept"];
    if (!ha) return false;
    return (~ha.indexOf("html"));
  }

  function leave(req) {
    var url = req.url;
    var ignored = false;
    if (!url) return true;
    ignore.forEach(function(item) {
      if (~url.indexOf(item)) {
        ignored = true;
      }
    });
    return ignored;
  }

  // http://stackoverflow.com/questions/5612787/converting-an-object-to-a-string#answer-18368918
  function convertToText(obj) {
    //create an array that will later be joined into a string.
    var string = [];

    //is object
    //    Both arrays and objects seem to return "object"
    //    when typeof(obj) is applied to them. So instead
    //    I am checking to see if they have the property
    //    join, which normal objects don't have but
    //    arrays do.
    if (typeof(obj) == "object" && (obj.join == undefined)) {
      string.push("{");
      for (prop in obj) {
          string.push(prop, ": ", convertToText(obj[prop]), ",");
      };
      string.push("}");

    //is array
    } else if (typeof(obj) == "object" && !(obj.join == undefined)) {
      string.push("[")
      for(prop in obj) {
          string.push(convertToText(obj[prop]), ",");
      }
      string.push("]");

    //is function
    } else if (typeof(obj) == "function") {
      string.push(obj.toString());

    //all other values can be done with JSON.stringify
    } else {
      string.push(JSON.stringify(obj));
    }

    return string.join("").replace(/,(}|])/, "$1");
}

  // middleware
  return function injectSnippets(req, res, next) {
    if (res._injectSnippets) return next();
    res._injectSnippets = true;

    var writeHead = res.writeHead;
    var write = res.write;
    var end = res.end;

    if (!accept(req) || leave(req)) {
      return next();
    }

    function restore() {
      res.writeHead = writeHead;
      res.write = write;
      res.end = end;
    }

    res.push = function(chunk) {
      res.data = (res.data || '') + chunk;
    };

    res.inject = res.write = function(string, encoding) {
      if (string !== undefined) {
        var body = string instanceof Buffer ? string.toString(encoding) : string;
        if (exists(body) && !snip(res.data)) {
          res.push(snap(body));
          return true;
        } else if (html(body) || html(res.data)) {
          res.push(body);
          return true;
        } else {
          restore();
          return write.call(res, string, encoding);
        }
      }
      return true;
    };

    res.writeHead = function() {};

    res.end = function(string, encoding) {
      restore();
      var result = res.inject(string, encoding);
      if (!result) return end.call(res, string, encoding);
      if (res.data !== undefined && !res._header) res.setHeader('content-length', Buffer.byteLength(res.data, encoding));
      res.end(res.data, encoding);
    };
    next();
  };

}