/* Offline presentation only: results and statuses are produced by the test run. */
'use strict';
const model = JSON.parse(document.getElementById('results').textContent);
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const outcome = test => test.comparison ? (test.comparison.equal ? 'equal' : 'different') : 'none';
const asset = (test, name) => `cases/${encodeURIComponent(test.id)}/${encodeURIComponent(name)}`;
const badge = (text, kind) => `<span class="badge ${kind}">${escapeHtml(text)}</span>`;
let selected = decodeURIComponent(location.hash.slice(1));
let view = 'comparison';

$('allure-link').href = model.allure_url;
if (model.run_url) { $('run-link').hidden = false; $('run-link').href = model.run_url; }
const metrics = [['Tests',model.cases.length],['Passed',model.cases.filter(t=>t.status==='PASS').length],['Failed',model.cases.filter(t=>t.status==='FAIL').length],['Skipped',model.cases.filter(t=>t.status==='SKIP').length],['Tests with differences',model.cases.filter(t=>outcome(t)==='different').length]];
$('metrics').innerHTML = metrics.map(([label,value])=>`<div class="metric"><strong>${value}</strong><span>${label}</span></div>`).join('');
for (const category of [...new Set(model.cases.map(t=>t.category))].sort()) {
  const option = document.createElement('option'); option.value=category; option.textContent=category; $('category').append(option);
}
$('trend').innerHTML = (model.history || []).map(run => {
  const total = Object.values(run.counts).reduce((sum,n)=>sum+n,0) || 1;
  return `<a class="trend-column" href="${escapeHtml(run.url)}" title="Run #${run.run_number}: ${run.counts.PASS} passed, ${run.counts.FAIL} failed, ${run.counts.SKIP} skipped"><div class="trend-bar">${['SKIP','FAIL','PASS'].map(status=>`<span class="bar-${status.toLowerCase()}" style="height:${100*run.counts[status]/total}%"></span>`).join('')}</div><small>#${run.run_number}</small></a>`;
}).join('') || '<p>No historical runs yet.</p>';
$('run-details').innerHTML = `<dl><dt>Run</dt><dd>#${model.run_number}</dd><dt>Generated</dt><dd>${escapeHtml(model.generated_at)}</dd><dt>Commit</dt><dd>${escapeHtml(model.commit?.slice(0,12) || 'local')}</dd><dt>Playbot</dt><dd>${escapeHtml(model.version)}</dd></dl>`;
$('provenance').textContent = `Generated ${model.generated_at} · Playbot ${model.version} · Commit ${model.commit || 'local'} · Image ${model.digest}`;

function renderList() {
  const query=$('search').value.toLowerCase();
  const cases=model.cases.filter(t=>(!$('status').value || t.status===$('status').value) && (!$('category').value || t.category===$('category').value) && (!$('comparison').value || outcome(t)===$('comparison').value) && `${t.name} ${t.documentation}`.toLowerCase().includes(query));
  $('count').textContent=`${cases.length} of ${model.cases.length} tests`;
  if (!cases.some(t=>t.id===selected)) selected=cases[0]?.id;
  $('test-list').innerHTML=cases.map(t=>`<button class="test ${t.id===selected?'selected':''}" data-id="${escapeHtml(t.id)}" aria-pressed="${t.id===selected}">${badge(t.status,t.status.toLowerCase())} <small>${escapeHtml(t.category)}</small><strong>${escapeHtml(t.name)}</strong><small>${outcome(t)==='none'?'No comparison':`Comparison: ${outcome(t)}`}</small></button>`).join('') || '<p class="empty">No tests match these filters.</p>';
  document.querySelectorAll('.test').forEach(button=>button.onclick=()=>{selected=button.dataset.id;view='comparison';history.replaceState(null,'',`#${selected}`);renderList();});
  renderDetail(model.cases.find(t=>t.id===selected));
}
function image(test, file, caption) {
  return `<figure><figcaption>${escapeHtml(caption)}</figcaption>${file?`<a href="${asset(test,file)}" target="_blank" rel="noopener"><img src="${asset(test,file)}" alt="${escapeHtml(caption)}" loading="lazy"></a>`:'<div class="placeholder">Page absent / no image</div>'}</figure>`;
}
function renderDetail(test) {
  if (!test) { $('detail').innerHTML='<p class="empty">No test selected.</p>';return; }
  const result=test.comparison;
  $('detail').innerHTML=`<div class="detail-top">${badge(test.status,test.status.toLowerCase())}${badge(test.category,'')}${badge(outcome(test)==='none'?'No comparison':`Comparison: ${outcome(test)}`,outcome(test))}<small>${test.duration_seconds==null?'':`${test.duration_seconds}s`}</small></div>
    <h2>${escapeHtml(test.name)}</h2><p class="purpose">${escapeHtml(test.documentation)}</p>
    ${test.evidence_missing?'<p class="callout error">Evidence collection did not complete. The final Robot status is shown; inspect Allure or the GitHub run for the infrastructure error.</p>':''}
    ${test.message?`<p class="callout error">${escapeHtml(test.message)}</p>`:''}
    ${result?`<div class="meta"><span>Compared pages: ${escapeHtml(result.pages_compared?.join(', ') || '—')}</span><span>Affected pages: ${escapeHtml(result.affected_pages?.join(', ') || 'none')}</span></div>${result.limit_reached?'<p class="callout">Comparison stopped at the configured difference limit. Later pages were not necessarily checked.</p>':''}`:''}
    <div class="tabs" role="group" aria-label="Evidence view"><button id="show-comparison" class="${view==='comparison'?'active':''}">Result evidence</button><button id="show-sources" class="${view==='sources'?'active':''}">Source documents</button></div>
    <div id="evidence"></div>
    <h3>Execution steps</h3><p class="explanation">Recorded Robot keywords, status and duration, including setup and teardown. An expected failure inside a passing scenario remains visible.</p><div class="steps">${renderSteps(test.steps || [])}</div>
    <details><summary>Test history (${(test.history || []).length} runs)</summary><div class="test-history">${(test.history || []).map(run=>`<a href="${escapeHtml(run.url)}">${badge(run.status,run.status.toLowerCase())} Run #${run.run_number} · ${run.duration_seconds}s</a>`).join('')}</div></details>
    <details><summary>Settings and masks</summary><pre>${escapeHtml(JSON.stringify({settings:test.settings,mask:test.mask_config || null},null,2))}</pre></details>
    <details><summary>Download evidence (${test.files.length} files)</summary><div class="files">${test.files.map(name=>`<a href="${asset(test,name)}" target="_blank" rel="noopener">${escapeHtml(name)}</a>`).join('')}</div></details>`;
  $('show-comparison').onclick=()=>{view='comparison';renderDetail(test);};
  $('show-sources').onclick=()=>{view='sources';renderDetail(test);};
  if (view==='sources') renderSources(test); else renderEvidence(test);
}
function renderSteps(steps) {
  return steps.map(step=>`<details class="step"><summary>${badge(step.status || '—',(step.status || '').toLowerCase())} <span>${escapeHtml(step.name)}</span><small>${step.duration_seconds.toFixed(3)}s</small></summary>${step.arguments.length?`<pre>${escapeHtml(step.arguments.join(' · '))}</pre>`:''}${step.messages.map(msg=>`<pre class="step-log">${escapeHtml(msg.level)}: ${escapeHtml(msg.text)}</pre>`).join('')}${renderSteps(step.steps)}</details>`).join('');
}
function pageSelector(pages, render) {
  if (pages.length>1) {
    const label=document.createElement('label');label.className='page-control';label.textContent='Page';
    const select=document.createElement('select');select.setAttribute('aria-label','Page');
    for (const page of pages) {const option=document.createElement('option');option.value=page;option.textContent=page;select.append(option);}
    label.append(select);$('evidence').append(label);select.onchange=()=>render(Number(select.value));
  }
  const content=document.createElement('div');content.id='page-evidence';$('evidence').append(content);render(pages[0]);
}
function renderSources(test) {
  const count=Math.max(test.previews.expected?.length||0,test.previews.actual?.length||0,1);
  $('evidence').innerHTML='<p class="explanation">Original demo inputs, before comparison masks. Download the PDF files below to inspect the originals.</p>';
  pageSelector(Array.from({length:count},(_,i)=>i+1),page=>{
    const left=test.previews.expected?.[page-1] || (page===1 && test.inputs.expected?.endsWith('.png')?test.inputs.expected:null);
    const right=test.previews.actual?.[page-1];
    $('page-evidence').innerHTML=`<div class="gallery two">${image(test,left,'Expected / original')}${image(test,right,'Actual')}</div>`;
  });
}
function renderEvidence(test) {
  const result=test.comparison;
  if (result && Array.isArray(result.differences) && result.differences.length) {
    pageSelector(result.differences.map(d=>d.page),page=>{
      const diff=result.differences.find(d=>d.page===page);
      const reasons={pixels_changed:'Pixels changed',missing_page:'Page missing in one document',page_size_changed:'Page dimensions changed'};
      $('page-evidence').innerHTML=`<p class="explanation">${escapeHtml(reasons[diff.reason] || diff.reason)} · ${diff.score} changed pixels. Images include configured masks; absent pages appear as a blank canvas.</p><div class="gallery">${image(test,diff.artifacts.expected,'Expected (comparison)')}${image(test,diff.artifacts.actual,'Actual (comparison)')}${image(test,diff.artifacts.diff,'Highlighted difference')}</div>`;
    });
  } else if (result && !Array.isArray(result.differences) && Object.keys(result.differences||{}).length) {
    pageSelector(Object.keys(result.differences).map(Number),page=>{
      const diff=result.differences[page];
      $('page-evidence').innerHTML=`<div class="text-grid"><div><h3>Expected text</h3><pre>${escapeHtml(diff.expected ?? "[MISSING PAGE]")}</pre></div><div><h3>Actual text</h3><pre>${escapeHtml(diff.actual ?? "[MISSING PAGE]")}</pre></div></div><a href="${asset(test,'diff.html')}" target="_blank" rel="noopener">Open HTML text report ↗</a>`;
    });
  } else if (test.files.includes('redacted.pdf') || test.files.includes('redacted.png')) {
    const preview=test.previews.redacted || ['redacted.png'];
    pageSelector(preview.map((_,i)=>i+1),page=>{
      const original=test.previews.expected?.[page-1] || test.inputs.expected;
      $('page-evidence').innerHTML=`<div class="gallery two">${image(test,original,'Original demo input')}${image(test,preview[page-1],'Redacted output')}</div><p class="explanation">${test.files.includes('redacted.pdf')?'The exported PDF contains raster pages. Searchable text, forms and signatures are not preserved.':'The exported PNG contains opaque black pixels in the configured region.'}</p>`;
    });
  } else {
    $('evidence').innerHTML=`<p class="callout">${result?.equal?'No differences on the selected pages after the configured masks. See source documents for the original inputs.':'This scenario produced no comparison report. Read its purpose and test status above; absence of a report does not establish PDF equality.'}</p>`;
  }
}
for (const id of ['search','status','category','comparison']) $(id).addEventListener('input',renderList);
window.addEventListener('hashchange',()=>{selected=decodeURIComponent(location.hash.slice(1));renderList();});
renderList();
