export function vehicleTelemetry(snapshot, net, id) {
  const car=snapshot?.cars.find(c=>c.id===id),done=snapshot?.completedCars?.find(c=>c.id===id),failed=snapshot?.failedRoutes?.find(c=>c.id===id),pending=snapshot?.pendingCars?.find(c=>c.id===id);
  const record=car||done||failed||pending;
  const path=car&&net?.paths[car.path],edge=path&&(net.edges[path.edge]||net.edges[path.incoming]);
  const label=node=>net?.nodes[node]?.name||node||'—';
  const total=done?.duration??(car?Math.max(0,snapshot.time-car.scheduled):null);
  const waiting=done?.waiting??(car?Math.max(0,car.entered-car.scheduled):null);
  return {id,car,done,path,edge,status:car?(snapshot.timedOut||snapshot.stats?.timedOut?'模拟超时':car.reason||'行驶中'):done?'已到达':failed?`路线未完成：${failed.reason}`:pending?'等待入场':snapshot?'未找到车辆':'等待开始模拟',
    speed:car?car.v*3.6:done?0:null,acceleration:car?.acc??null,limit:path?.speed??null,
    lane:path?.type==='road'?`车道 ${path.lane+1}`:path?`连接段 → 车道 ${(net.paths[path.to]?.lane??0)+1}`:'—',
    progress:path?Math.max(0,Math.min(100,car.s/path.length*100)):null,
    remaining:path?Math.max(0,path.length-car.s):null,
    segment:edge?`${label(edge.from)} → ${label(edge.to)}`:'—',
    origin:label(record?.origin),destination:label(record?.destination),total,waiting,driving:total===null?null:Math.max(0,total-waiting),
    changes:record?.laneChanges??null,voluntary:record?.voluntaryChanges??null,
    route:car?.route.map((edgeId,i)=>{const e=net?.edges[edgeId];return {id:edgeId,current:i===car.routeIndex,label:e?`${label(e.from)} → ${label(e.to)}`:edgeId};})||[]};
}
