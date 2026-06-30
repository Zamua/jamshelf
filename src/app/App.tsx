import { BrowserRouter } from 'react-router-dom';
import { Experience } from './Experience';

// jamshelf: ONE persistent 3D experience. `/` is the shelf, `/<id>` is the instrument
// on the desk; the Experience reads the route and floats the device between them, so
// nothing remounts and there is no cut. (BrowserRouter still gives real, deep-linkable
// URLs; the future /rig/<uuid> is just another route the Experience can read.)
export default function App() {
  return (
    <BrowserRouter>
      <Experience />
    </BrowserRouter>
  );
}
