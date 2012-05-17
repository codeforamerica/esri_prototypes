var request = require("request");
var express = require("express");
var app = express.createServer();
var fs = require("fs");

app.use(express.bodyParser());
app.use(express.logger({ format: ':method :url' }));

app.all('/proxy', function(req, resp){
    var url = req.originalUrl.replace("/proxy?", "")
    var pxreq = request({uri:url, method:req.method, headers:req.header, form:req.body}, function(error, response, body){
        resp.headers =response.headers
        resp.send(body);
    });
    //req.pipe(request(url)).pipe(resp)
});


app.all('/camera', function(req, resp){
    var url = "http://goakamai.org/"+req.param("url", "");

    console.log("headers",req.headers);
    req.headers.referer = "http://goakamai.org/Home.aspx";

    var x = request(url)
    req.pipe(x)
    
    x.pipe(resp)


    //req.pipe(request(url)).pipe(resp)
});


app.use('/', express.static(__dirname + '/')); 
var port = process.env.PORT || 3005;
app.listen(port, function() {
  console.log("Listening on " + port);
});



