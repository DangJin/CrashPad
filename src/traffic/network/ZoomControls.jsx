import { ZoomControls as SharedZoomControls } from '../../components/workbench/index.jsx';
export default function ZoomControls(props) { return <div className="network-view-controls"><SharedZoomControls {...props} min={1} max={600}/></div>; }
