import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let code = html.match(/<script>([\s\S]*)<\/script>/)[1];
code = code.replace(/^\s*\(function\(\)\{/, '').replace(/\}\)\(\);\s*$/, '');
const stub = [
 'const mk=()=>({addEventListener(){},classList:{add(){},remove(){}},style:{},setAttribute(){},getAttribute(){return null},textContent:"",innerHTML:"",files:[],clientWidth:800,getContext:()=>({setTransform(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText(){},save(){},restore(){},translate(){},rotate(){},setLineDash(){}})});',
 'globalThis.document={getElementById:mk,documentElement:{setAttribute(){},getAttribute(){return null}}};',
 'globalThis.window={matchMedia:()=>({matches:false}),devicePixelRatio:1,print(){}};',
 'globalThis.getComputedStyle=()=>({getPropertyValue:()=>"#000000"});'
].join('\n');
fs.writeFileSync('_probe.mjs', stub+'\n'+code+'\nexport { fitStaged, parseTrace, k4_readings, bootstrapReadings, mulberry32, locusK, isPhysical, EXAMPLE, SELFTEST };');
console.log('probe rebuilt from the published page');
