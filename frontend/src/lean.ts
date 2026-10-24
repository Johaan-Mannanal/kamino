import './lean.css'
import { liveApi, type Api } from './api'
import { mockApi, setMockScenario } from './mock'
import { makeProperties, validatePhotos } from './properties'
import type { Job, Source } from './types'

const mode = import.meta.env.VITE_API_MODE === 'live' ? 'live' : 'mock'
const api: Api = mode === 'live' ? liveApi : mockApi
const app = document.querySelector<HTMLDivElement>('#app')!
let files: File[] = [], job: Job | null = null, message = '', busy = false, health = 'Connecting'
let timer: number | undefined
let draft: Record<string, string> = {}
let scenario: 'normal' | 'provider_failure' | 'completed_demo' = 'normal'
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const val = (key: string, fallback: string | number) => esc(draft[key] ?? String(fallback))
const names: Record<Source,string> = {measured:'Measured',user_supplied:'User supplied',sourced:'Sourced',estimated:'Estimated'}
const opts = (current: Source) => (Object.keys(names) as Source[]).map(s => `<option value="${s}" ${s === current ? 'selected' : ''}>${names[s]}</option>`).join('')
const select = (name: string, current: Source, disabled: boolean) => `<select name="${name}" ${disabled ? 'disabled' : ''}>${opts((draft[name] as Source) || current)}</select>`
const input = (name: string, label: string, fallback: string | number, disabled: boolean, required = false) => `<label>${label}<input name="${name}" ${required ? 'type="number" min="0.001" step="any" required' : 'type="text"'} value="${val(name,fallback)}" ${disabled ? 'disabled' : ''}></label>`
const running = (s: Job['status']) => ['queued','reconstructing','preparing','validating'].includes(s)
const safe = (p: string) => p.split('/').every(x => x && x !== '.' && x !== '..' && !x.includes(':') && !x.includes('\\'))
const link = (p: string, label: string) => safe(p) ? `<a href="${esc(api.fileUrl(job!.id,p))}" download="${esc(p.split('/').pop() || 'file')}"><span>${esc(label)}</span><span>Download ↓</span></a>` : ''
function stages() {
  const s = job?.status, recon = !!job?.mesh_path, props = !!job?.properties, geometry = !!job?.asset, exported = s === 'completed' && !!job?.export_path
  const items: [string,string,string][] = [
    ['Upload',job?'done':'waiting',job ? `${job.source_images.length} photos` : ''],
    ['Reconstruction',s==='failed'&&!recon?'failed':recon?'done':job?'current':'waiting',job?`${job.progress}%`:''],
    ['Properties',props?'done':s==='awaiting_properties'?'current':'waiting',props?'Saved':''],
    ['Geometry',geometry?'done':s==='preparing'?'current':'waiting',''],
    ['Simulation',exported?'done':s==='validating'?'current':'waiting',''],
    ['Export',exported?'done':'waiting','']
  ]
  return items.map(([name,state,detail]) => `<div class="stage ${state}"><span class="mark">${state==='done'?'✓':state==='failed'?'!':''}</span><strong>${name}</strong><span>${detail}</span></div>`).join('')
}
function render() {
  const focus = document.activeElement as HTMLInputElement | HTMLSelectElement | null
  const focusName = focus?.name
  const editable = !!files.length || !!job, done = job?.status === 'completed', canSave = job?.status === 'awaiting_properties'
  app.innerHTML = `<header><div><strong>Photo2Sim</strong><span>${esc(health)} · ${job ? `${job.synthetic?'Synthetic':'Provider generated'} · ${esc(job.provider)}` : mode==='mock'?'Synthetic demo':'Live API'}</span></div></header>
  <main><h1>Create an asset</h1><p class="intro">Photos, measurements, and a downloadable simulation file.</p>
  ${mode==='mock'||job?.synthetic?`<div class="mode-note"><strong>Synthetic demo</strong><span>The mock creates a known cube. Photos do not affect the result.</span></div>`:''}
  ${message?`<div class="notice" role="alert">${esc(message)} <button id="dismiss" aria-label="Dismiss">×</button></div>`:''}
  <section><h2><span>1</span>Photos</h2><div class="body"><label class="drop" id="drop" for="photos">Drop photos here or choose files <span>1–4 JPEG, PNG, or WebP · 10 MiB each</span></label><input id="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden>${files.map((f,i)=>`<div class="selected"><span>${esc(f.name)}</span><button type="button" data-index="${i}" class="remove">Remove</button></div>`).join('')}${mode==='mock'?`<label class="demo">Demo result ${selectScenario()}</label>`:''}<button class="primary" id="upload" ${busy||!files.length?'disabled':''}>${busy?'Uploading…':job?'Start new job':'Upload photos'}</button></div></section>
  <section><h2><span>2</span>Object data</h2><div class="body">${editable?`<form id="properties"><div class="field-head">Full dimensions <span>millimetres</span></div><div class="grid three">${(['x','y','z'] as const).map(a=>input(a,a.toUpperCase(),job?.properties?job.properties.dimensions_m[a]*1000:'',!!done,true)).join('')}</div><div class="grid two gap"><label>Dimension source ${select('dimensions_source',job?.properties?.dimensions_m.source||'measured',!!done)}</label>${input('dimensions_note','Note · optional',job?.properties?.dimensions_m.note||'',!!done)}</div><div class="grid two gap">${input('mass','Mass · grams',job?.properties?job.properties.mass_kg.value*1000:'',!!done,true)}<label>Mass source ${select('mass_source',job?.properties?.mass_kg.source||'user_supplied',!!done)}</label></div>${input('mass_note','Mass note · optional',job?.properties?.mass_kg.note||'',!!done)}<div class="grid two gap"><label>Sliding friction · blank if unknown<input name="friction" type="number" min="0" step="any" value="${val('friction',job?.properties?.sliding_friction?.value??'')}" ${done?'disabled':''}></label><label>Friction source ${select('friction_source',job?.properties?.sliding_friction?.source||'estimated',!!done)}</label></div>${input('friction_note','Friction note · optional',job?.properties?.sliding_friction?.note||'',!!done)}<div class="form-end"><span>mm → m and g → kg when saved</span>${!done?`<button class="primary" ${!canSave||busy?'disabled':''}>${busy?'Saving…':'Save properties'}</button>`:''}</div>${!canSave&&!done?`<p class="hint">${job?'Enter measurements now. Save after reconstruction.':'Upload photos to start.'}</p>`:''}</form>`:'<p class="empty">Upload photos to add measurements.</p>'}</div></section>
  <section><h2><span>3</span>Process</h2><div class="body"><div class="stages">${stages()}</div>${job?`<div class="jobline">Job ${esc(job.id.slice(0,8))}<button id="refresh">Refresh</button></div>`:''}${job?.status==='failed'?`<div class="failure"><strong>${esc(job.error?.code||'Failed')}</strong><p>${esc(job.error?.message||'The provider did not finish.')}</p></div>`:''}${job?.status==='awaiting_properties'?'<p class="hint">Reconstruction is complete. Geometry and export are not connected in the current backend.</p>':''}</div></section>
  <section><h2><span>4</span>Files</h2><div class="body">${job?.mesh_path||job?.export_path||job?.asset?`<div class="files">${job?.mesh_path?link(job.mesh_path,'Reconstructed mesh'):''}${job?.asset&&job.asset.visual_mesh!==job.mesh_path?link(job.asset.visual_mesh,'Prepared mesh'):''}${job?.export_path?link(job.export_path,'MuJoCo scene'):''}</div>`:'<p class="empty">Files appear when available.</p>'}${done&&mode==='mock'?'<p class="hint">Synthetic UI demo. No geometry or simulation validation was run.</p>':''}</div></section></main>`
  bind()
  if (focusName) document.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${focusName}"]`)?.focus({preventScroll:true})
}
function selectScenario() { return `<select id="scenario"><option value="normal" ${scenario==='normal'?'selected':''}>Reconstruction only</option><option value="provider_failure" ${scenario==='provider_failure'?'selected':''}>Provider failure</option><option value="completed_demo" ${scenario==='completed_demo'?'selected':''}>Synthetic export</option></select>` }
function schedule() { if (timer) clearTimeout(timer); if (job&&running(job.status)) timer=window.setTimeout(refresh,1000) }
async function refresh() { if (!job) return; try { job=await api.get(job.id); message=''; render(); schedule() } catch(e) { message=`${(e as Error).message} Inputs are kept. Select Refresh to retry.`; render() } }
function bind() {
  document.querySelector<HTMLInputElement>('#photos')?.addEventListener('change',e=>{files=[...((e.target as HTMLInputElement).files||[])];message=validatePhotos(files)||'';render()})
  const drop=document.querySelector<HTMLElement>('#drop')
  drop?.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('over')})
  drop?.addEventListener('dragleave',()=>drop.classList.remove('over'))
  drop?.addEventListener('drop',e=>{e.preventDefault();files=[...(e.dataTransfer?.files||[])];message=validatePhotos(files)||'';render()})
  document.querySelectorAll<HTMLButtonElement>('.remove').forEach(b=>b.addEventListener('click',()=>{files.splice(Number(b.dataset.index),1);message='';render()}))
  document.querySelector<HTMLSelectElement>('#scenario')?.addEventListener('change',e=>{scenario=(e.target as HTMLSelectElement).value as typeof scenario;setMockScenario(scenario)})
  document.querySelector('#upload')?.addEventListener('click',async()=>{const error=validatePhotos(files);if(error){message=error;render();return}busy=true;message='';render();try{job=await api.create(files);draft={};render();schedule()}catch(e){message=(e as Error).message}finally{busy=false;render()}})
  document.querySelector('#refresh')?.addEventListener('click',refresh)
  document.querySelector<HTMLFormElement>('#properties')?.addEventListener('input',e=>{const t=e.target as HTMLInputElement|HTMLSelectElement;if(t.name)draft[t.name]=t.value})
  document.querySelector<HTMLFormElement>('#properties')?.addEventListener('change',e=>{const t=e.target as HTMLInputElement|HTMLSelectElement;if(t.name)draft[t.name]=t.value})
  document.querySelector<HTMLFormElement>('#properties')?.addEventListener('submit',async e=>{e.preventDefault();if(!job||job.status!=='awaiting_properties')return;draft=Object.fromEntries([...new FormData(e.target as HTMLFormElement)].map(([k,v])=>[k,String(v)]));try{const properties=makeProperties(draft);busy=true;render();job=await api.save(job.id,properties);draft={};message=job.status==='awaiting_properties'?'Properties saved. Export is not available yet.':''}catch(error){message=(error as Error).message}finally{busy=false;render()}})
  document.querySelector('#dismiss')?.addEventListener('click',()=>{message='';render()})
}
render()
api.health().then(r=>{health=r.status==='ok'?'API connected':r.status;render()}).catch(()=>{health='API offline';render()})
