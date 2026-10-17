let loading, identity, loaded;
export const getLoadedAMap = () => loaded;
export function loadAMap(key, securityJsCode) {
  key=key.trim(); securityJsCode=securityJsCode.trim();
  if(!key || !securityJsCode) return Promise.reject(Error('请填写高德 JS API Key 和安全密钥。'));
  const next=JSON.stringify([key,securityJsCode]);
  if(identity && identity!==next) return Promise.reject(Error('地图已使用另一组凭据加载，请刷新页面后更换。'));
  if(loading)return loading;
  identity=next;
  window._AMapSecurityConfig={securityJsCode};
  loading=new Promise((resolve,reject)=>{
    const script=document.createElement('script'); let timer;
    const finish=error=>{
      clearTimeout(timer);script.onload=script.onerror=null;
      if(error){script.remove();reject(Error('地图加载失败，请检查网络、Key、域名白名单与额度后重试。'));}
      else {loaded=window.AMap;resolve(loaded);}
    };
    script.src=`https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&plugin=AMap.PlaceSearch,AMap.Driving`;
    script.async=true;script.onload=()=>finish(!window.AMap?.Map || !window.AMap?.Driving || !window.AMap?.PlaceSearch);script.onerror=()=>finish(true);
    timer=setTimeout(()=>finish(true),15000);document.head.append(script);
  }).catch(error=>{loading=null;throw error;});
  return loading;
}
export function amapRequest(invoke, label) {
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error(`${label}超时，请检查网络后重试。`)),15000);
    try{invoke((status,result)=>{clearTimeout(timer);if(status==='complete')resolve(result);else reject(Error(status==='no_data'?`没有找到${label}结果，请调整搜索条件。`:`${label}失败，请检查凭据、权限、额度或网络后重试。`));});}
    catch{clearTimeout(timer);reject(Error(`${label}暂不可用，请重新连接地图。`));}
  });
}
