dojo.require("esri.map");
dojo.require("esri.tasks.locator");
dojo.require("esri.tasks.route");
dojo.require("esri.utils");
dojo.require("esri.layers.FeatureLayer");

// camera routes
dojo.require("esri.tasks.query");
dojo.require("esri.tasks.geometry");
var gsvc;

var map, locator, routeTask, routeParams, routes = [];
var fromSymbol, toSymbol, routeSymbol, segmentSymbol, cameraSymbol;
var from, to, directions, directionFeatures, segmentGraphic, featureLayer;

function init() {
    esri.config.defaults.io.proxyUrl = "/proxy";
    
    gsvc = new esri.tasks.GeometryService("http://tasks.arcgisonline.com/ArcGIS/rest/services/Geometry/GeometryServer");

    var initExtent = new esri.geometry.Extent({
        "xmin":-158.33141,
        "ymin":21.234489,
        "xmax":-157.593266,
        "ymax":21.711964,
        "spatialReference":{"wkid":4326}
    });

    map = new esri.Map("map", {
        extent: esri.geometry.geographicToWebMercator( initExtent )
    });


    featureLayer = new esri.layers.FeatureLayer("http://services.arcgis.com/tNJpAOha4mODLkXz/arcgis/rest/services/Traffic_Cameras/FeatureServer/0",{
        mode: esri.layers.FeatureLayer.MODE_SNAPSHOT,
        outFields: ["*"]
    });

    
    map.addLayer(new esri.layers.ArcGISTiledMapServiceLayer("http://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer"));
    
    locator = new esri.tasks.Locator("http://tasks.arcgisonline.com/ArcGIS/rest/services/Locators/TA_Address_NA/GeocodeServer");
    dojo.connect(locator, "onError", errorHandler);
    
    routeTask = new esri.tasks.RouteTask("http://tasks.arcgisonline.com/ArcGIS/rest/services/NetworkAnalysis/ESRI_Route_NA/NAServer/Route");
//    routeTask = new esri.tasks.RouteTask("http://maps.esri.com/apl4/rest/services/CCH/StreetNetwork/NAServer/Route");
    routeParams = new esri.tasks.RouteParameters();
    routeParams.stops = new esri.tasks.FeatureSet();
    routeParams.returnRoutes = false;
    routeParams.returnDirections = true;
    routeParams.directionsLengthUnits = esri.Units.MILES;
    routeParams.outSpatialReference = new esri.SpatialReference({ wkid:102100 });
    
    dojo.connect(routeTask, "onSolveComplete", showRoute);
    dojo.connect(routeTask, "onError", errorHandler);
    dojo.connect(map.graphics, "onClick", function(evt){
        console.log("click: ", evt);
    });
    dojo.query('#getdirections').onclick(getDirections);
    
    //Configure symbols to be used for destinations and route segments
    fromSymbol = new esri.symbol.SimpleMarkerSymbol().setColor(new dojo.Color([0,255,0]));
    toSymbol = new esri.symbol.SimpleMarkerSymbol().setColor(new dojo.Color([255,0,0]));
    cameraSymbol = new esri.symbol.PictureMarkerSymbol({
        "url":"http://i.imgur.com/dS1At.png",
        "height":24,
        "width":20,
        "yoffset":10,
        "type":"esriPMS"
    });
    routeSymbol = new esri.symbol.SimpleLineSymbol().setColor(new dojo.Color([0,0,255,0.5])).setWidth(4);
    segmentSymbol = new esri.symbol.SimpleLineSymbol().setColor(new dojo.Color([255,0,0,0.5])).setWidth(8);
}

dojo.addOnLoad(init);

function getDirections() {
    routeParams.stops.features = [];
    map.graphics.clear();
    segmentGraphic = null;
    
    //Parse and geocode "from" address
    var fromArr = dojo.byId("fromTxf").value.split(","),
    fromAddress = { Address:fromArr[0], City:fromArr[1], State:fromArr[2], Zip:fromArr[3] };
    locator.addressToLocations(fromAddress, ["Loc_name"], function(addressCandidates) { configureRoute(addressCandidates, "from"); });
    
    //Parse and geocode "to" address
    var toArr = dojo.byId("toTxf").value.split(","),
    toAddress = { Address:toArr[0], City:toArr[1], State:toArr[2], Zip:toArr[3] };
    locator.addressToLocations(toAddress, ["Loc_name"], function(addressCandidates) { configureRoute(addressCandidates, "to"); });
}


function configureRoute(addressCandidates, type) {
    var stop = null, score = 0;
    
    //Get the address match with the top score
    dojo.forEach(addressCandidates, function(candidate) {
        // look for roof top locations first
        if (candidate.score > score && candidate.attributes.Loc_name === "US_RoofTop") {
            stop = candidate;
            score = candidate.score;
            // fall back to street locations
        } else if (candidate.score > score && candidate.attributes.Loc_name === "US_Streets") {
            stop = candidate;
            score = candidate.score;
        }
    });
    
    //convert the locations to web mercator to display on map
    var location = esri.geometry.geographicToWebMercator(stop.location);
    
    //Set the best address match as a stop on the route
    if (type === "from") {
        routeParams.stops.features[0] = map.graphics.add(new esri.Graphic(location, fromSymbol, { address:stop.address, score:stop.score }));
    }
    else if (type === "to") {
        routeParams.stops.features[1] = map.graphics.add(new esri.Graphic(location, toSymbol, { address:stop.address, score:stop.score }));
    }
    
    //If both the "to" and the "from" addresses are set, solve the route
    if (routeParams.stops.features.length === 2) {
        routeTask.solve(routeParams);
    }
}

function showRoute(solveResult) {
    directions = solveResult.routeResults[0].directions;
    directionFeatures = directions.features;
    
    //Add route to the map
    map.graphics.add(new esri.Graphic(directions.mergedGeometry, routeSymbol));

    //Display the total time and distance of the route
    dojo.byId("summary").innerHTML = "<br /> &nbsp; Total distance: " + formatDistance(directions.totalLength, "miles") + "<br /> &nbsp; Total time: " + formatTime(directions.totalTime);
    
    //List the directions and create hyperlinks for each route segment
    var dirStrings = ["<ol>"];
    dojo.forEach(solveResult.routeResults[0].directions.features, function(feature, i) {
        dirStrings.push("<li onclick='zoomToSegment(" + i + "); return false;' class=\"segment\"><a href=\"#\">" + feature.attributes.text + " (" + formatDistance(feature.attributes.length ,"miles") + ", " + formatTime(feature.attributes.time) + ")</a></li>");
    });
    dirStrings.push("</ol>");
    dojo.byId("directions").innerHTML = dirStrings.join("");
    
    zoomToFullRoute();
    
	bufferRoute();
}

//Display any errors that were caught when attempting to solve the rotue
function errorHandler(err) {
    alert("An error occured\n" + err.message + "\n" + err.details.join("\n"));
}

//Zoom to the appropriate segment when the user clicks a hyperlink in the directions list
function zoomToSegment(index) {
    var segment = directionFeatures[index];
    map.setExtent(segment.geometry.getExtent(), true);
    if (! segmentGraphic) {
        segmentGraphic = map.graphics.add(new esri.Graphic(segment.geometry, segmentSymbol));
    }
    else {
        segmentGraphic.setGeometry(segment.geometry);
    }
}

function zoomToFullRoute() {
    map.graphics.remove(segmentGraphic);
    segmentGraphic = null;
    map.setExtent(directions.extent, true);
}

function bufferRoute(){

    dojo.connect(gsvc, "onBufferComplete", function(geometries) {
        var symbol = new esri.symbol.SimpleFillSymbol("none", new esri.symbol.SimpleLineSymbol("dashdot", new dojo.Color([255,0,0]), 2), new dojo.Color([255,255,0,0.25]));
        dojo.forEach(geometries, function(geo){
	        graphic = new esri.Graphic(geo,symbol);
	        map.graphics.add(graphic);
	    });
        var query = new esri.tasks.Query();
        query.geometry = geometries[0];
        query.spatialRelationship = esri.tasks.Query.SPATIAL_REL_CONTAINS;
        
        featureLayer.queryFeatures(query, function(featureset){console.log("features:", featureset);
                                                               dojo.query("#cameras").empty();
                                                               cameraOrder =[];
                                                               for(f in featureset.features){
                                                                   feat = featureset.features[f];
          	                                                       feat.distance = Math.pow(routeParams.stops.features[0].geometry.x - feat.geometry.x, 2) 
                                                                       + Math.pow(routeParams.stops.features[0].geometry.y - feat.geometry.y, 2)
                                                                   for(c in cameraOrder){
                                                                       if(cameraOrder[c].distance > feat.distance){
                                                                           cameraOrder.splice(c, 0,feat)
                                                                           break;
                                                                       }else if(c == cameraOrder.length-1){
                                                                           cameraOrder.push(feat)
                                                                       }
                                                                   }
                                                                   if(cameraOrder.length === 0){
                                                                       cameraOrder.push(feat);
                                                                   }
                                                                   var g = new esri.Graphic(feat.geometry,cameraSymbol);
                                                                   map.graphics.add(g);
                                                               }
                                                               for(c in cameraOrder){
                                                                   dojo.query("#cameras").addContent("<img id='"+cameraOrder[c].attributes.FID+
                                                                                                     "' src='/camera?url="+encodeURIComponent(cameraOrder[c].attributes.CameraImageURL)+"&time="+
                                                                                                     (+new Date())+"' />");
                                                               }


                                                              }, function(error){console.log("Error", error);})
        
    });

    var params = new esri.tasks.BufferParameters();
    params.geometries = [ directions.mergedGeometry ];
    params.distances = [ 0.035 ];
    params.unit = esri.tasks.GeometryService.UNIT_KILOMETER;
    params.bufferSpatialReference = new esri.SpatialReference({wkid: 102100});
    params.outSpatialReference = map.spatialReference;
    gsvc.buffer(params);
    
}




//Format the time as hours and minutes
function formatTime(time) {
    var hr = Math.floor(time / 60), //Important to use math.floor with hours
    min = Math.round(time % 60);

    if (hr < 1 && min < 1) {
        return "";
    }
    else if (hr < 1) {
        return min + " minute(s)";
    }

    return hr + " hour(s) " + min + " minute(s)";
}

//Round the distance to the nearest hundredth of a unit
function formatDistance(dist, units) {
    var d = Math.round(dist * 100) / 100;
    if (d === 0) {
        return "";
    }

    return d + " " + units;
}





