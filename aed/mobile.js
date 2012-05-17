dojo.require("esri.map");

dojo.require("esri.toolbars.draw");
dojo.require("esri.toolbars.edit");
dojo.require("esri.tasks.geometry");
dojo.require("esri.tasks.query");
dojo.require("esri.layers.FeatureLayer");
dojo.require("dojox.mobile.parser");
dojo.require("dojox.mobile");
dojo.requireIf(!dojo.isWebKit, "dojox.mobile.compat");


var map, toolbar, editToolbar, drawToolActive, featureLayer, userLoc;

userLoc = {lat:null, lng:null};

function init() {
    //onorientationchange doesn't always fire in a timely manner in Android so check for both orientationchange and resize 
    var supportsOrientationChange = "onorientationchange" in window,
    orientationEvent = supportsOrientationChange ? "orientationchange" : "resize";

    window.addEventListener(orientationEvent, function () {
        orientationChanged();
    }, false);




    //esri.config.defaults.io.proxyUrl = "/arcgisserver/apis/javascript/proxy/proxy.ashx";

    var startExtent = new esri.geometry.Extent({
        xmax: -17521736,
        xmin: -17631805,
        ymax: 2464849,
        ymin: 2415165,
        spatialReference: {
            wkid: 102100
          }
        });

    map = new esri.Map("map", {
        extent: startExtent,
        wrapAround180: true
    });

    dojo.connect(map, "onLoad", createToolbar);

    //var basemap = new esri.layers.ArcGISTiledMapServiceLayer("http://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer");
    var basemap = new esri.layers.ArcGISTiledMapServiceLayer("http://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer");

    map.addLayer(basemap);
    map.showZoomSlider();


}

function zoomToLocation(location) {
    userLoc.lat = location.coords.latitude;
    userLoc.lng = location.coords.longitude;

    var pt = esri.geometry.geographicToWebMercator(new esri.geometry.Point(location.coords.longitude, location.coords.latitude));
    addGraphic(pt);    
    map.centerAndZoom(pt, 17);
}

function showLocation(location) {
    //zoom to the users location and add a graphic
    var pt = esri.geometry.geographicToWebMercator(new esri.geometry.Point(location.coords.longitude, location.coords.latitude));
    if (!graphic) {
        addGraphic(pt);
    }
    else { //move the graphic if it already exists
        graphic.setGeometry(pt);
    }
    //map.centerAt(pt);
}
function hideLocation(){
    map.graphics.clear();
}
      
function addGraphic(pt){
    var symbol = new esri.symbol.SimpleMarkerSymbol(esri.symbol.SimpleMarkerSymbol.STYLE_CIRCLE, 12, 
                                                    new esri.symbol.SimpleLineSymbol(esri.symbol.SimpleLineSymbol.STYLE_SOLID,
                                                                                     new dojo.Color([55, 116, 255, 0.5]), 8), 
                                                    new dojo.Color([55, 116, 255, 0.9]));
    graphic = new esri.Graphic(pt, symbol);
    map.graphics.add(graphic);
}
function locationError(){
    console.log("err getting loc")
}

function createToolbar(map) {
//    var featureLayer = new esri.layers.FeatureLayer("http://services.arcgis.com/tNJpAOha4mODLkXz/arcgis/rest/services/DefibrillatorLocations/FeatureServer/0",{
//        outFields: ["*"]
//    });

    if(navigator.geolocation){  
        navigator.geolocation.getCurrentPosition(zoomToLocation, locationError);
        navigator.geolocation.watchPosition(showLocation, locationError);
    }


        featureLayer = new esri.layers.FeatureLayer("http://services.arcgis.com/tNJpAOha4mODLkXz/arcgis/rest/services/aed/FeatureServer/0",{
            mode: esri.layers.FeatureLayer.MODE_SNAPSHOT,
            outFields: ["*"]
//          infoTemplate: infoTemplate
        });

//    var rend =new esri.renderer.SimpleRenderer( new esri.symbol.SimpleFillSymbol().setColor(new dojo.Color([254,216,93,.60])));
//    featureLayer.setRenderer(rend);
    featureLayer.setSelectionSymbol(new esri.symbol.SimpleFillSymbol().setColor(new dojo.Color([0,255,255,.60])));
        
    dojo.connect(featureLayer,'onClick',function(evt){
        //select the clicked feature
        var query = new esri.tasks.Query();
        query.geometry = evt.mapPoint;
        featureLayer.selectFeatures(query,esri.layers.FeatureLayer.SELECTION_NEW);    
    });
  
    map.addLayer(featureLayer);

    toolbar = new esri.toolbars.Draw(map);
    dojo.connect(toolbar, "onActivate", function () {
        drawToolActive = true;
    });

    dojo.connect(toolbar, "onDrawEnd", addToMap);
    editToolbar = new esri.toolbars.Edit(map);
    
    dojo.connect(featureLayer, "onClick", function (evt) {
//        if (drawToolActive === false) {
        dojo.stopEvent(evt);
        console.log("Edit MODE")
        editToolbar.activate(esri.toolbars.Edit.MOVE, evt.graphic);
/*        dojo.connect(evt.graphic, "onGraphicMoveStop", function(evt){
            console.log("apply me some edits", evt);
            featureLayer.applyEdits(null, evt.graphic, null);
        });*/

  //      }
    });


    dojo.query("#addPoint").onclick(function(e){
        console.log("add point");
        
        var pt;
        if(userLoc.lat !== null){
            pt = esri.geometry.geographicToWebMercator(new esri.geometry.Point(userLoc.lng, userLoc.lat, map.spatialReference))
        }else{
            pt = new esri.geometry.Point(map.extent.getCenter().x,map.extent.getCenter().y,map.spatialReference)
        }

        
        dojo.query("#modalMessage").style({ display:"block" }); 

        var sms = new esri.symbol.SimpleMarkerSymbol().setStyle(
            esri.symbol.SimpleMarkerSymbol.STYLE_SQUARE).setColor(
                new dojo.Color([255,0,0,0.5]));

        var attr = {LocDesc:"That place"};
        

        hideLocation();
        featureLayer.applyEdits([(new esri.Graphic(pt, sms, attr, null))], null, null, function(add,update,del){console.log("done", add,update,del);}, function(e){console.log("error", e)});

    });

    dojo.query("#closeMessage").onclick(function(e){
        dojo.query("#modalMessage").style({ display:"none" }); 
    });



    //deactivate the toolbar when you click outside a graphic
    dojo.connect(map, "onClick", function (evt) {
        editToolbar.deactivate();
    });
    dojo.connect(editToolbar, "onGraphicMoveStop", function(graphic, transform){
        featureLayer.applyEdits(null, [graphic], null, function(add, update, del){console.log("done", add, update, del);}, function(e){console.log("error", e)});
    });

}


function addToMap(geometry) {
    console.log("draw add to map")
    drawToolActive = false;

    var symbol = new esri.symbol.SimpleMarkerSymbol(esri.symbol.SimpleMarkerSymbol.STYLE_SQUARE, 10, new esri.symbol.SimpleLineSymbol(esri.symbol.SimpleLineSymbol.STYLE_SOLID, new dojo.Color([255, 0, 0]), 1), new dojo.Color([0, 255, 0, 0.25]));

    var graphic = new esri.Graphic(geometry, symbol);
    map.graphics.add(graphic);
    toolbar.deactivate();

}
function orientationChanged() {
    if (map) {
        map.reposition();
        map.resize();
    }
    
}

dojo.addOnLoad(init);
