(()=>{
// Deterministic SDK contract fixture, never shipped in the application.
class LngLat {constructor(lng,lat){this.lng=lng;this.lat=lat;}getLng(){return this.lng;}getLat(){return this.lat;}}
class Map {constructor(host){if(!host.clientWidth||!host.clientHeight)throw Error('Map container must be visible');this.host=host;host.style.background='#e8eff2';host.innerHTML='<div style="padding:24px">地图 SDK 测试替身 · 合成路线</div>';window.__testMap=this;}on(event,cb){this.callback=cb;}remove(){}add(){}setFitView(){}destroy(){this.host.innerHTML='';window.__mapDestroyed=true;}}
class Shape {constructor(options){this.options=options;}on(event,cb){this.callback=cb;}}
class PlaceSearch {search(keyword,cb){if(keyword==='无结果')return cb('no_data',{});const end=keyword.includes('终');cb('complete',{poiList:{pois:[{name:end?'测试终点':'测试起点',address:'合成测试数据',location:new LngLat(end?116.006:116,end?39.005:39)}]}});}}
class Driving {search(start,end,opts,cb){window.__routeRequests=(window.__routeRequests||0)+1;const finish=()=>cb(window.__routeError?'error':'complete',{routes:[{policy:'推荐路线',traffic_lights:2,steps:[{road:'测试大道',distance:500,path:[new LngLat(116,39),new LngLat(116.006,39)]},{road:'测试北路',distance:500,path:[new LngLat(116.006,39),new LngLat(116.006,39.005)]}]}]});if(window.__holdRoute)window.__finishRoute=finish;else finish();}}
window.AMap={Map,LngLat,PlaceSearch,Driving,Marker:Shape,Polyline:Shape};

})();
