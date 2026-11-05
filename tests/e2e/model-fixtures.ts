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

/** Self-authored analytic cylinder with a 1 mm toroidal top fillet (radius 5, height 9 mm). */
export function roundedCylinderStep(): Buffer {
  const entities: string[] = [];
  const add = (text: string) => { entities.push(`#${entities.length+1}=${text};`); return `#${entities.length}`; };
  const application = add("APPLICATION_CONTEXT('mechanical design')");
  const pc = add(`PRODUCT_CONTEXT('',${application},'mechanical')`);
  const product = add(`PRODUCT('rounded cylinder','rounded cylinder','',(${pc}))`);
  const formation = add(`PRODUCT_DEFINITION_FORMATION('','',${product})`);
  const context = add(`PRODUCT_DEFINITION_CONTEXT('part definition',${application},'design')`);
  const definition = add(`PRODUCT_DEFINITION('','',${formation},${context})`);
  const shape = add(`PRODUCT_DEFINITION_SHAPE('','',${definition})`);
  const unit = add('(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))');
  const angle = add('(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))');
  const solidAngle = add('(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())');
  const uncertainty = add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-7),${unit},'distance_accuracy_value','')`);
  const geometricContext = add(`(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${uncertainty}))GLOBAL_UNIT_ASSIGNED_CONTEXT((${unit},${angle},${solidAngle}))REPRESENTATION_CONTEXT('',''))`);
  const z = add("DIRECTION('',(0.,0.,1.))"); const x = add("DIRECTION('',(1.,0.,0.))");
  const rings = [[5,0],[5,8],[4,9]].map(([radius,height]) => {
    const center = add(`CARTESIAN_POINT('',(0.,0.,${height}.))`);
    const axis = add(`AXIS2_PLACEMENT_3D('',${center},${z},${x})`);
    const point = add(`CARTESIAN_POINT('',(${radius}.,0.,${height}.))`);
    const vertex = add(`VERTEX_POINT('',${point})`);
    const circle = add(`CIRCLE('',${axis},${radius}.)`);
    const edge = add(`EDGE_CURVE('',${vertex},${vertex},${circle},.T.)`);
    return { axis, edge };
  });
  const bound = (index: number, forward: boolean) => {
    const edge = add(`ORIENTED_EDGE('',*,*,${rings[index].edge},.${forward ? 'T' : 'F'}.)`);
    const loop = add(`EDGE_LOOP('',(${edge}))`);
    return add(`FACE_BOUND('',${loop},.T.)`);
  };
  const bottom = add(`PLANE('',${rings[0].axis})`);
  const cylinder = add(`CYLINDRICAL_SURFACE('',${rings[0].axis},5.)`);
  const fillet = add(`TOROIDAL_SURFACE('',${rings[1].axis},4.,1.)`);
  const top = add(`PLANE('',${rings[2].axis})`);
  const faces = [
    add(`ADVANCED_FACE('',(${bound(0,true)}),${bottom},.F.)`),
    add(`ADVANCED_FACE('',(${bound(0,false)},${bound(1,true)}),${cylinder},.T.)`),
    add(`ADVANCED_FACE('',(${bound(1,false)},${bound(2,true)}),${fillet},.T.)`),
    add(`ADVANCED_FACE('',(${bound(2,true)}),${top},.T.)`),
  ];
  const shell = add(`CLOSED_SHELL('',(${faces.join(',')}))`);
  const solid = add(`MANIFOLD_SOLID_BREP('rounded cylinder',${shell})`);
  const representation = add(`ADVANCED_BREP_SHAPE_REPRESENTATION('',(${solid}),${geometricContext})`);
  add(`SHAPE_DEFINITION_REPRESENTATION(${shape},${representation})`);
  return Buffer.from(`ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('Self-authored rounded cylinder'),'2;1');\nFILE_NAME('rounded-cylinder.stp','2026-11-05T00:00:00',(''),(''),'local fixture','local fixture','');\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN'));\nENDSEC;\nDATA;\n${entities.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`);
}
