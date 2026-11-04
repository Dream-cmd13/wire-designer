import { Buffer } from 'node:buffer';

/** Self-authored ISO 10303-21 fixture: two tetrahedra 10 mm apart. No private model data. */
export function twoTetrahedraStep(): Buffer {
  const entities: string[] = [];
  const add = (text: string) => { entities.push(`#${entities.length+1}=${text};`); return `#${entities.length}`; };
  const application = add("APPLICATION_CONTEXT('mechanical design')");
  const pc = add(`PRODUCT_CONTEXT('',${application},'mechanical')`);
  const product = add(`PRODUCT('two solids','two solids','',(${pc}))`);
  const formation = add(`PRODUCT_DEFINITION_FORMATION('','',${product})`);
  const context = add(`PRODUCT_DEFINITION_CONTEXT('part definition',${application},'design')`);
  const definition = add(`PRODUCT_DEFINITION('','',${formation},${context})`);
  const shape = add(`PRODUCT_DEFINITION_SHAPE('','',${definition})`);
  const unit = add('(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))');
  const angle = add('(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))');
  const solidAngle = add('(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())');
  const uncertainty = add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-7),${unit},'distance_accuracy_value','')`);
  const geometricContext = add(`(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${uncertainty}))GLOBAL_UNIT_ASSIGNED_CONTEXT((${unit},${angle},${solidAngle}))REPRESENTATION_CONTEXT('',''))`);
  const num = (n: number) => Number.isInteger(n) ? `${n}.` : String(n);
  const vector = (v: number[]) => `(${v.map(num).join(',')})`;
  const solids = [0,10].map((offset) => {
    const points = [[offset,0,0],[offset+2,0,0],[offset,3,0],[offset,0,4]];
    const refs = points.map((point) => add(`CARTESIAN_POINT('',${vector(point)})`));
    const faces = [[0,2,1],[0,1,3],[0,3,2],[1,2,3]].map((indices) => {
      const [a,b,c] = indices.map((i) => points[i]);
      const u = b.map((v,i) => v-a[i]); const v = c.map((x,i) => x-a[i]);
      const normal = [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      const direction = add(`DIRECTION('',${vector(normal)})`);
      const ref = add(`DIRECTION('',${vector(u)})`);
      const axis = add(`AXIS2_PLACEMENT_3D('',${refs[indices[0]]},${direction},${ref})`);
      const plane = add(`PLANE('',${axis})`);
      const loop = add(`POLY_LOOP('',(${indices.map((i) => refs[i]).join(',')}))`);
      const bound = add(`FACE_OUTER_BOUND('',${loop},.T.)`);
      return add(`FACE_SURFACE('',(${bound}),${plane},.T.)`);
    });
    const shell = add(`CLOSED_SHELL('',(${faces.join(',')}))`);
    return add(`FACETED_BREP('tetra-${offset}',${shell})`);
  });
  const representation = add(`FACETED_BREP_SHAPE_REPRESENTATION('',(${solids.join(',')}),${geometricContext})`);
  add(`SHAPE_DEFINITION_REPRESENTATION(${shape},${representation})`);
  return Buffer.from(`ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('Self-authored two tetrahedra'),'2;1');\nFILE_NAME('two-tetrahedra.stp','2026-11-04T00:00:00',(''),(''),'local fixture','local fixture','');\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN'));\nENDSEC;\nDATA;\n${entities.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`);
}
