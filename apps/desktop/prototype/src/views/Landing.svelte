<script lang="ts">
  import { app } from '../lib/state.svelte';
  import Mark from '../lib/Mark.svelte';
  import Icon from '../lib/Icon.svelte';
  import Chip from '../lib/Chip.svelte';
  import { reveal } from '../lib/actions';
  import { fade } from 'svelte/transition';

  const repo = 'https://github.com/OctoKon/Splyce';
  let demo = $state<'waiting' | 'allowed' | 'denied'>('waiting');

  const facts = [
    ['Fully local', 'Generation, memory and verification on your machine'],
    ['Receipts, not claims', 'Intent, policy and outcome recorded per action'],
    ['Cited memory', 'Cross-session recall with sources you can inspect'],
    ['One loop', 'Pi owns turns; Splyce owns policy and effects'],
  ];

  const checks = [
    ['Policy checked before dispatch', 'every tool call'],
    ['Denied effects leave no writes', 'negative tests'],
    ['Stale verification cannot apply', 'revision binding'],
    ['Uncertain effects are surfaced', 'no replay'],
    ['All model roles run locally', 'no fallback'],
    ['Memory is workspace-scoped', 'explicit grant'],
  ];

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
</script>

<div class="lp">
  <header class="l-nav">
    <button
      class="l-brand"
      type="button"
      onclick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      <Mark size={23} />
      Splyce
      <em>Windows V1</em>
    </button>
    <div class="l-links">
      <button type="button" onclick={() => scrollTo('product')}>Product</button>
      <button type="button" onclick={() => scrollTo('workflow')}>Workflow</button>
      <button type="button" onclick={() => scrollTo('safety')}>Evidence</button>
    </div>
    <span class="spacer"></span>
    <div class="l-nav-actions">
      <a class="btn ghost" href={repo} target="_blank" rel="noreferrer">
        GitHub <Icon name="external" size={13} />
      </a>
      <button class="btn primary" type="button" onclick={() => app.go('work')}
        >Open workspace</button
      >
    </div>
  </header>

  <main>
    <section class="l-hero">
      <div class="l-wrap">
        <div class="l-kicker"><span class="dot"></span> A local-first coding agent harness</div>
        <h1 class="l-display">Every change,<br />backed by <em>evidence.</em></h1>
        <p class="l-lede">
          Splyce runs a coding agent on your machine, gates every side effect, and keeps a receipt
          for each step — so a finished run is something you can <b>verify</b>, not something you
          have to trust.
        </p>
        <div class="l-cta">
          <button class="btn primary" type="button" onclick={() => app.go('work')}
            >Open the workspace</button
          >
          <button class="btn secondary" type="button" onclick={() => app.openRun('r-1042')}>
            See a run <Icon name="arrow-right" size={14} />
          </button>
        </div>
        <div class="l-note">No cloud fallback · Windows WebView2 · AGPL-3.0-only</div>

        <div class="preview-frame" use:reveal={120}>
          <div class="frame-bar">
            <span class="dots"><i></i><i></i><i></i></span>
            <span class="path"
              >payments-api <span style="color:var(--text-faint)">/</span>
              <b>splyce/webhook-signature</b></span
            >
            {#if demo === 'waiting'}
              <Chip tone="err" dot>Needs approval</Chip>
            {:else if demo === 'allowed'}
              <Chip tone="outline" dot>Applied</Chip>
            {:else}
              <Chip tone="outline" dot>Denied</Chip>
            {/if}
          </div>

          <div class="frame-body">
            <div class="frame-main">
              <div class="frame-turn">
                <span class="frame-av">You</span>
                <div>
                  <div class="who">You <span>3m ago</span></div>
                  <div class="txt">
                    Fix webhook signature verification when the timestamp header is missing.
                    Acceptance: npm test -- webhooks passes.
                  </div>
                </div>
              </div>
              <div class="frame-turn agent">
                <span class="frame-av">Pi</span>
                <div>
                  <div class="who">Pi <span>local · Qwen3-Coder</span></div>
                  <div class="txt">
                    The missing header path skipped normalisation and failed after the HMAC
                    comparison. I added a regression case and bound the fix to the current base.
                  </div>
                  <div class="frame-plan">
                    <div><b>01</b> Read verify.ts and headers.ts</div>
                    <div>
                      <b>02</b> Patch normalisation
                      <span style="margin-left:auto;color:var(--add-text)">+42 −11</span>
                    </div>
                    <div>
                      <b>03</b> Verify final revision
                      <span style="margin-left:auto">exit 0 · 24 tests</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="frame-side">
              <span class="s-label">Effect gate</span>
              <div class="mini-approval">
                <div class="ma-top">
                  <Chip tone="err" dot>Waiting for approval</Chip>
                </div>
                <div class="ma-title">Apply 3 files to splyce/webhook-signature</div>
                <div class="ma-cmd">base a3f91c2 · receipt rc-8841</div>
                {#if demo === 'waiting'}
                  <div class="ma-actions">
                    <button class="btn primary" type="button" onclick={() => (demo = 'allowed')}
                      >Allow once</button
                    >
                    <button class="btn secondary" type="button" onclick={() => (demo = 'denied')}
                      >Deny</button
                    >
                  </div>
                {:else}
                  <div class="ma-done" transition:fade={{ duration: 160 }}>
                    <Icon name={demo === 'allowed' ? 'check' : 'x'} size={11} stroke={2.2} />
                    {demo === 'allowed'
                      ? 'Applied · no unresolved effects'
                      : 'Denied · no bytes changed'}
                    <button
                      class="btn link"
                      type="button"
                      style="margin-left:auto;font-size:10px"
                      onclick={() => (demo = 'waiting')}
                    >
                      Reset
                    </button>
                  </div>
                {/if}
              </div>
              <div class="frame-diff">
                <div class="fh">
                  <span>verify.ts</span><span style="margin-left:auto">+5 −2</span>
                </div>
                <div class="fl d">
                  <span class="n">13</span><span>− const timestamp = headers[</span>
                </div>
                <div class="fl a">
                  <span class="n">13</span><span>+ const timestamp = header(</span>
                </div>
                <div class="fl a">
                  <span class="n">14</span><span>+ if (!timestamp) return rejected(</span>
                </div>
                <div class="fl">
                  <span class="n">18</span><span> const age = Date.now() - …</span>
                </div>
              </div>
              <span class="s-label" style="margin-top:2px">Receipt chain</span>
              <div class="term">
                rc-8837 <span class="dim">intent · base a3f91c2</span>
                rc-8838 <span class="dim">read · allowed</span>
                rc-8840 <span class="dim">edit · allowed</span>
                rc-8841 <span class="ok">verify · exit 0</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="l-facts">
      <div class="inner">
        {#each facts as fact (fact[0])}
          <div class="fact"><b>{fact[0]}</b><span>{fact[1]}</span></div>
        {/each}
      </div>
    </section>

    <section class="l-section" id="product">
      <div class="l-wrap">
        <div class="l-sec-head">
          <div class="l-eyebrow">The product</div>
          <h2>An agent harness that shows its work.</h2>
          <p>
            Built on Pi. Splyce adds the boundary, the receipt and the memory — without creating a
            second autonomous loop.
          </p>
        </div>
        <div class="l-features">
          <div class="l-feature" use:reveal={0}>
            <span class="l-ico"><Icon name="shield" size={17} /></span>
            <h3>A policy boundary, not a promise</h3>
            <p>
              Every tool call is checked at dispatch against the intersection of user, run, host and
              workspace grants. A denial means no effect — not a retry with a friendlier prompt.
            </p>
            <button class="more" type="button" onclick={() => scrollTo('safety')}>
              Read the boundary <Icon name="arrow-right" size={12} />
            </button>
          </div>
          <div class="l-feature" use:reveal={80}>
            <span class="l-ico"><Icon name="receipt" size={17} /></span>
            <h3>Receipts for every effect</h3>
            <p>
              Durable intent, policy decision and observed result. A crash after intent is
              uncertain, never a silent success. Verification binds to the exact final revision.
            </p>
            <button class="more" type="button" onclick={() => app.openRun('r-1042')}>
              Inspect a receipt chain <Icon name="arrow-right" size={12} />
            </button>
          </div>
          <div class="l-feature" use:reveal={160}>
            <span class="l-ico"><Icon name="database" size={17} /></span>
            <h3>Memory that shows its sources</h3>
            <p>
              Summaries carry evidence IDs, revisions and scope. Expand to the original file and
              range, correct a decision, or delete it and rebuild every derived index.
            </p>
            <button class="more" type="button" onclick={() => app.go('memory')}>
              Open cited memory <Icon name="arrow-right" size={12} />
            </button>
          </div>
        </div>
      </div>
    </section>

    <section class="l-section" id="workflow">
      <div class="l-wrap">
        <div class="l-sec-head">
          <div class="l-eyebrow">The run</div>
          <h2>One loop. Four honest states.</h2>
          <p>
            Nothing is implicit: the task, the scope, the effect and the proof each get their own
            step.
          </p>
        </div>
        <div class="l-steps">
          <div class="step" use:reveal={0}>
            <div class="n">01</div>
            <h3>State the task</h3>
            <p>
              Pick a local workspace, a base revision and an acceptance test. The run record is
              created before any model turn.
            </p>
            <div class="meta">run · grants · budgets</div>
          </div>
          <div class="step" use:reveal={60}>
            <div class="n">02</div>
            <h3>Scope the work</h3>
            <p>
              Pi plans and calls tools. Splyce checks each capability against the effective grants
              before dispatch.
            </p>
            <div class="meta">policy gate · intent</div>
          </div>
          <div class="step" use:reveal={120}>
            <div class="n">03</div>
            <h3>Approve effects</h3>
            <p>
              Writes and shell commands wait for you unless a narrow rule allows them. Every
              decision gets a receipt.
            </p>
            <div class="meta">review · allow · deny</div>
          </div>
          <div class="step" use:reveal={180}>
            <div class="n">04</div>
            <h3>Verify, then apply</h3>
            <p>
              The final revision runs the exact verifier. A stale tree blocks apply; an uncertain
              effect is never replayed.
            </p>
            <div class="meta">exit 0 · final diff</div>
          </div>
        </div>
      </div>
    </section>

    <section class="l-safety" id="safety">
      <div class="l-wrap">
        <div class="l-safety-grid">
          <div use:reveal={0}>
            <div class="l-eyebrow">Evidence</div>
            <blockquote>
              “A model statement that tests passed is <em>not a receipt.</em>”
            </blockquote>
          </div>
          <div class="l-safety-body" use:reveal={80}>
            <p>
              Splyce binds every verification to the final revision, the exact command and its exit
              code. If the workspace moved after the test, the result is stale — and apply is
              blocked, not quietly re-run against a different tree.
            </p>
            <ul class="l-checks">
              {#each checks as check (check[0])}
                <li>
                  <Icon name="check" size={12} stroke={2.2} />
                  {check[0]}
                  <span>{check[1]}</span>
                </li>
              {/each}
            </ul>
            <div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap">
              <a
                class="btn secondary"
                href={`${repo}/blob/main/MASTER-PLAN.md`}
                target="_blank"
                rel="noreferrer"
              >
                Read the master plan <Icon name="external" size={12} />
              </a>
              <a
                class="btn ghost"
                href={`${repo}/blob/main/research/docs/design/implementation-contracts.md`}
                target="_blank"
                rel="noreferrer"
              >
                Implementation contracts <Icon name="external" size={12} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="l-cta-band">
      <div class="l-wrap">
        <div class="l-eyebrow">Windows V1</div>
        <h2>Run it locally.<br />Keep the receipts.</h2>
        <p>A calm desktop workspace for one coding agent, its evidence and the memory it earns.</p>
        <button class="btn primary" type="button" onclick={() => app.go('work')}>
          Open the workspace <Icon name="arrow-right" size={14} />
        </button>
        <div class="fine">
          Tauri 2 · WebView2 · AGPL-3.0-only · design reference, not a shipped runtime
        </div>
      </div>
    </section>
  </main>

  <footer class="l-foot">
    <div class="l-wrap inner">
      <span class="brand">
        <Mark size={17} />
        Splyce
      </span>
      <nav>
        <button type="button" onclick={() => scrollTo('product')}>Product</button>
        <button type="button" onclick={() => scrollTo('workflow')}>Workflow</button>
        <button type="button" onclick={() => scrollTo('safety')}>Evidence</button>
        <a href={repo} target="_blank" rel="noreferrer">GitHub</a>
      </nav>
      <span class="copy">UI/UX reference · Splyce runtime n=0</span>
    </div>
  </footer>
</div>

<style>
  .l-nav-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .preview-frame {
    box-shadow: 0 24px 60px -48px var(--shadow-soft);
    text-align: left;
  }
  .l-brand em {
    border-left: 1px solid var(--border);
  }
  @media (max-width: 820px) {
    .l-nav-actions .btn.ghost {
      display: none;
    }
  }
</style>
