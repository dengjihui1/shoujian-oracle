export const courtyardStyles = `<style>
  :host { display:block; color-scheme:dark; --ink:#101b1b; --paper:#efe7d5; --muted:#b4b7a7; --gold:#d9bd84; --line:#d3bd8230; color:var(--paper); font:15px/1.7 "Microsoft YaHei",system-ui,sans-serif; }
  *,*::before,*::after { box-sizing:border-box; }
  [hidden] { display:none!important; }
  button,textarea { font:inherit; }
  button,a,summary { -webkit-tap-highlight-color:transparent; }
  button { min-height:44px; padding:10px 20px; border:1px solid #bda26b63; border-radius:4px; color:#e4d4b3; background:#152421; cursor:pointer; transition:background .18s,border-color .18s; }
  button:hover:not(:disabled) { background:#30413a; border-color:var(--gold); }
  button:disabled { opacity:.48; cursor:not-allowed; }
  button:focus-visible,a:focus-visible,summary:focus-visible,textarea:focus-visible,[data-latest]:focus-visible { outline:2px solid #f0cd87; outline-offset:4px; }
  .primary { background:#d9bd84; border-color:#d9bd84; color:#16201c; font-weight:600; }
  .primary:hover:not(:disabled) { background:#efdaa8; border-color:#efdaa8; }
  .shell { max-width:1240px; margin:auto; padding:0 38px 30px; }
  .masthead { height:84px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--line); }
  .wordmark { display:flex; align-items:center; gap:13px; text-decoration:none; color:var(--paper); font:26px/1.3 "STKaiti","KaiTi",serif; letter-spacing:.2em; }
  .wordmark small { display:block; margin-top:5px; color:#b2ae98; font:9px/1.5 system-ui,sans-serif; letter-spacing:.24em; }
  .seal { display:grid; place-items:center; width:40px; height:45px; border:1px solid #af6753; color:#e2b79a; background:#773d30; border-radius:3px; font-size:28px; }
  .system-state { display:flex; gap:24px; align-items:center; }
  .status { font-size:11px; color:var(--muted); letter-spacing:.06em; }
  .status::before { content:""; display:inline-block; width:5px; height:5px; margin-right:8px; border-radius:50%; background:#c9ac7e; }
  .status.online::before { background:#9cbea0; box-shadow:0 0 10px #9cbea04d; }
  .quiet-button { padding:4px 0; border:0; background:none; color:#c3b58f; font-size:11px; }
  .master-card { position:relative; display:grid; place-items:center; min-height:240px; isolation:isolate; text-align:center; }
  .hero-copy { padding:45px 0 48px; }
  .eyebrow { margin:0 0 20px; font-size:10px; letter-spacing:.42em; color:#c7b98f; }
  h1 { margin:0; font:400 clamp(32px,4.3vw,56px)/1.4 "STKaiti","KaiTi","Noto Serif SC",serif; letter-spacing:.12em; text-shadow:0 4px 25px #000; }
  h1 em { color:var(--gold); font-style:normal; }
  .hero-copy>p:last-child { margin:20px 0 0; color:#b7bcad; font-size:12px; letter-spacing:.08em; }
  .landscape { position:absolute; z-index:-1; inset:0 -38px -145px; overflow:hidden; pointer-events:none; mask-image:linear-gradient(#000 70%,transparent); }
  .moon { position:absolute; width:172px; height:172px; top:34px; right:10%; border-radius:50%; border:1px solid #dec18b32; background:radial-gradient(circle at 40% 35%,#d9cfaf28,#b1b19309 65%); box-shadow:0 0 80px #cbc5a00a; }
  .moon::before { content:""; position:absolute; inset:12px; border-radius:50%; border:1px solid #d6bd8912; }
  .mountain { position:absolute; bottom:15%; left:-4%; width:110%; height:210px; clip-path:polygon(0 80%,8% 52%,14% 66%,23% 20%,27% 34%,31% 29%,43% 72%,52% 38%,58% 56%,68% 0,73% 28%,80% 17%,92% 71%,100% 40%,100% 100%,0 100%); background:linear-gradient(160deg,#61766934,#1b323125); }
  .mountain-front { bottom:0; transform:scaleX(-1); height:170px; background:linear-gradient(155deg,#48605c44,#0c1c1c); }
  .water { position:absolute; bottom:0; width:100%; height:80px; background:repeating-linear-gradient(0deg,transparent 0 13px,#c7c29d08 14px 15px); }
  .landscape-caption { position:absolute; left:5%; top:70px; writing-mode:vertical-rl; font:12px/1.8 "KaiTi",serif; letter-spacing:.5em; color:#aeb89d70; }
  .experience { position:relative; max-width:850px; margin:auto; }
  .conversation-column { min-width:0; border:1px solid #bbac7540; border-radius:10px; background:linear-gradient(130deg,#1c2b27ed,#101e1dec); box-shadow:0 24px 100px #0005; overflow:hidden; }
  .conversation-head { display:flex; gap:15px; align-items:center; min-height:92px; padding:18px 30px; border-bottom:1px solid var(--line); }
  .host-copy { flex:1; min-width:0; }
  .host-copy>span { font:22px/1.5 "STKaiti","KaiTi",serif; letter-spacing:.15em; }
  .host-copy small { margin-left:10px; font:10px/1.5 system-ui,sans-serif; color:#bab99f; letter-spacing:.06em; }
  .host-copy p { margin:4px 0 0; font-size:12px; color:#b8c0ad; }
  .room-seal { border:1px solid #b1644d80; border-radius:3px; padding:5px; color:#c68c70; font:14px/1.4 "KaiTi",serif; writing-mode:vertical-rl; letter-spacing:.2em; }
  .avatar-stage { position:relative; flex:0 0 55px; height:55px; border:1px solid #b0aa7f60; border-radius:50%; overflow:hidden; background:radial-gradient(circle,#6a6c50,#0d1c1a); }
  .portrait-stack { position:absolute; width:110px; height:138px; left:50%; top:-7px; transform:translateX(-50%); }
  .portrait-stack img { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; }
  .avatar-speaking { opacity:0; clip-path:ellipse(11% 5.4% at 50% 28.7%); }
  [data-mouth-state="audio"] .avatar-speaking { opacity:var(--voice-level); }
  .oracle-halo,.attention-rings,.avatar-reading-token,.avatar-panel,.avatar-eyelids,.avatar-breath { display:none; }
  [data-avatar-state="listening"] { border-color:#afd5b2; box-shadow:0 0 0 5px #94bf9d16; }
  [data-avatar-state="speaking"] { border-color:#e6c994; box-shadow:0 0 18px #e6c99430; }
  .dialogue { display:grid; align-content:start; gap:20px; padding:24px 30px; max-height:380px; overflow:auto; scrollbar-color:#5f7767 #172522; overscroll-behavior:contain; }
  .is-welcome .dialogue { display:none; }
  .is-welcome .message { max-width:100%; }
  .is-welcome .message>b { display:none; }
  .is-welcome .message p { font-size:12px; color:#b9c2b4; }
  .message { max-width:94%; min-width:0; }
  .message>b { color:var(--gold); font-size:11px; font-weight:500; letter-spacing:.1em; }
  .message p { white-space:pre-line; overflow-wrap:anywhere; margin:6px 0 0; line-height:1.9; }
  .message.user { justify-self:end; padding:9px 16px; border:1px solid #a6b59824; border-radius:8px 0 8px 8px; background:#a6b5980d; }
  .message.user b { color:#bcc8b5; }
  .message.error { border-left:2px solid #d7937a; padding-left:14px; }
  .message.streaming p::after { content:"▍"; color:var(--gold); animation:blink 1s steps(1) infinite; }
  .controls { display:grid; gap:14px; padding:22px 30px 24px; border-top:1px solid #c4b98718; }
  .is-welcome .controls { border-top:0; padding-top:18px; }
  .question-seeds { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
  .question-seeds>span { margin-right:6px; font-size:10px; color:#a7b3a0; }
  .question-seeds button { min-height:32px; padding:4px 11px; font-size:11px; color:#d1c9ac; border-color:#aaa98735; background:transparent; border-radius:30px; }
  form { margin:0; }
  label { display:block; margin-bottom:10px; color:#d9d3bc; font-size:12px; }
  .input-row { display:grid; gap:12px; }
  textarea { display:block; width:100%; min-height:85px; resize:vertical; padding:14px 16px; border:1px solid #b4bb9663; border-radius:5px; color:#f2ead7; background:#08141380; line-height:1.7; font-size:14px; }
  textarea::placeholder { color:#a0aa99; font-size:12px; }
  textarea:disabled { opacity:.55; }
  .submit-actions { display:flex; gap:10px; }
  .submit-actions button { min-width:160px; }
  .composer-hint { display:block; margin-top:8px; text-align:right; color:#9ba994; font-size:10px; }
  .voice-conversation { display:grid; grid-template-columns:1fr auto; align-items:center; gap:10px; padding-top:14px; border-top:1px solid var(--line); }
  .voice-conversation-copy { display:grid; gap:3px; }
  .voice-conversation-copy strong { color:#d6dac7; font-size:12px; font-weight:500; }
  .voice-conversation-copy small { color:#a9b6a3; font-size:10px; }
  .voice-conversation-actions { display:flex; flex-wrap:wrap; gap:8px; }
  .voice-conversation-actions .primary { background:#263c31; border-color:#66836b; color:#e0e5cd; font-weight:400; font-size:12px; }
  .voice-conversation-status { display:grid; gap:5px; grid-column:1/-1; margin:0; padding:12px; background:#91b49b0b; color:#c9dec3; font-size:12px; overflow-wrap:anywhere; }
  .voice-conversation-status span { color:#b7c5b0; }
  .voice-latency { grid-column:1/-1; font-size:10px; }
  .utility-drawer,.memory-drawer { border-top:1px solid #b4af7c20; padding-top:8px; font-size:11px; color:#b5bfaa; }
  summary { min-height:36px; cursor:pointer; padding:7px 0; color:#b9c1ac; }
  summary span { margin-left:8px; color:#8e9c8b; }
  .voice-tools,.memory-tools>div,.voice-performance-actions { display:flex; flex-wrap:wrap; gap:8px; padding:9px 0; }
  .voice-tools button,.memory-tools button,.voice-performance-actions button { padding:8px 12px; font-size:11px; background:transparent; }
  .memory-tools small { display:block; max-width:650px; line-height:1.8; }
  .voice-performance { display:grid; gap:10px; padding:14px; border:1px solid var(--line); }
  .voice-performance>div:first-child { display:flex; flex-wrap:wrap; gap:10px; }
  .voice-notice,.voice-input-notice { margin:0; padding:10px 14px; background:#62412c24; border-left:2px solid #c59872; font-size:12px; color:#e0c8aa; }
  .text-button { justify-self:start; padding:6px 0; border:0; background:none; font-size:12px; }
  .stop-response { justify-self:start; border-color:#b88167; }
  .quick,.intake-actions { display:flex; flex-wrap:wrap; gap:8px; }
  .quick button,.intake-actions button { font-size:12px; }
  .rag-invitation { margin:0; color:var(--muted); font-size:12px; }
  .journey { display:flex; gap:24px; margin:0; padding:18px 30px; border-bottom:1px solid var(--line); list-style:none; font-size:11px; color:#94a48e; }
  .journey li { display:flex; gap:7px; align-items:center; }
  .journey span { color:#8d9e89; font-size:10px; }
  .journey [aria-current] { color:#f0d6a0; }
  .journey [aria-current] span { color:#e3c188; }
  .intake-card { display:grid; gap:10px; padding:18px; border:1px solid var(--line); border-radius:5px; background:#c9b37909; }
  .intake-card p { margin:0; font-size:13px; white-space:pre-line; }
  .intake-card small { color:var(--gold); }
  .intake-card textarea { min-height:150px; }
  .casting-invitation { text-align:center; padding:18px 10px; }
  h2 { font:400 27px/1.5 "KaiTi",serif; margin:8px 0; }
  .casting-invitation p { color:var(--muted); font-size:12px; margin-bottom:22px; }
  .coins { display:flex; justify-content:center; gap:18px; margin-bottom:20px; }
  .coins i { display:grid; place-items:center; width:48px; height:48px; border:3px double #c6a36c; border-radius:50%; color:var(--gold); font:20px "KaiTi",serif; box-shadow:0 4px 15px #0004; }
  .reading { margin:24px 30px 0; padding:24px; border:1px solid #c3a76d70; background:linear-gradient(130deg,#b69b5814,#182721); border-radius:4px; }
  .question { margin:0 0 12px; color:#c4c4ae; font-size:12px; overflow-wrap:anywhere; }
  .reading-title { display:flex; gap:18px; align-items:center; }
  .reading-title>span { font-size:56px; color:var(--gold); line-height:1.2; }
  .reading-title small { color:#bfbb9f; font-size:10px; }
  .reading-explanation { padding:18px 0; line-height:1.9; }
  .reading-explanation strong { color:var(--gold); font-size:13px; }
  .reading-explanation p { margin:8px 0 0; font-size:14px; }
  .reading ol { list-style:none; padding:16px 0; margin:0; }
  .line { display:flex; justify-content:space-between; gap:10px; }
  .line span { color:#d1bd90; font:22px/1.5 monospace; }
  .line small { font-size:11px; color:#b0b99f; }
  .line.moving span,.line.moving small { color:#e5a07f; }
  dl { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin:0; }
  dt { font-size:10px; color:#9eae94; } dd { margin:3px 0 0; font-size:12px; }
  .reading-disclaimer { margin:12px 0 0; color:#aeb59d; font-size:10px; }
  .rag-evidence { border-top:1px solid var(--line); margin-top:12px; font-size:12px; }
  .rag-evidence ol { padding-left:18px; }.rag-evidence li { margin:12px 0; }
  .rag-evidence a { color:#deca99; }.rag-evidence small { display:block; color:#a7b79b; }
  blockquote { margin:8px 0; padding-left:12px; border-left:2px solid #9c9466; color:#c6cdb8; white-space:pre-line; }
  .jump-latest { display:block; margin:0 auto 12px; font-size:12px; }
  footer { display:flex; justify-content:space-between; max-width:850px; margin:26px auto 0; color:#a4ad96; font:12px/1.6 "KaiTi",serif; letter-spacing:.14em; }
  footer small { font:10px/1.6 system-ui,sans-serif; letter-spacing:.06em; }
  .is-conversation .master-card { min-height:150px; }.is-conversation .hero-copy { padding:24px 0; }.is-conversation h1 { font-size:30px; }.is-conversation .eyebrow { display:none; }.is-conversation .hero-copy>p:last-child { margin-top:10px; }
  @keyframes blink { 50% { opacity:0; } }
  @media(min-width:1000px) { .is-welcome .experience::before { content:"觀心"; position:absolute; top:70px; left:-100px; writing-mode:vertical-rl; font:60px/1.5 "KaiTi",serif; color:#d9c38b12; letter-spacing:.4em; } }
  @media(max-width:650px) {
    .shell { padding:0 16px 24px; }.masthead { height:78px; }.wordmark { font-size:23px; }.wordmark small { font-size:8px; }.system-state { gap:4px; flex-direction:column; align-items:flex-end; }.status { font-size:9px; }.quiet-button { min-height:30px; font-size:10px; }
    .master-card { min-height:205px; }.hero-copy { padding:30px 0; }.eyebrow { margin-bottom:14px; font-size:9px; }h1 { font-size:clamp(26px,6.4vw,38px); letter-spacing:.04em; }.hero-copy>p:last-child { font-size:11px; margin-top:14px; }.moon { width:125px; height:125px; right:0; }.landscape { inset:0 -16px -100px; }.landscape-caption { display:none; }
    .conversation-head { padding:16px 18px; gap:12px; }.host-copy small { margin-left:4px; font-size:9px; }.host-copy p { font-size:11px; }.avatar-stage { flex-basis:46px; height:46px; }.room-seal { display:none; }
    .dialogue { padding:20px 18px; max-height:350px; }.message { max-width:100%; }.message p { font-size:14px; }.is-welcome .dialogue { padding:12px 18px 0; max-height:112px; }
    .controls { padding:18px; gap:12px; }.question-seeds { gap:6px; }.question-seeds>span { width:100%; }.question-seeds button { min-height:36px; }.submit-actions button { flex:1; min-width:0; padding:10px 8px; font-size:13px; }
    .voice-conversation { grid-template-columns:1fr; }.voice-conversation-actions button { flex:1; }.composer-hint { font-size:9px; }.journey { padding:14px 18px; gap:16px; font-size:10px; }.journey li { gap:4px; }
    .reading { margin:18px 18px 0; padding:18px; }.reading-explanation p { font-size:13px; }.reading-title h2 { font-size:24px; }.line { gap:6px; }.line span { font-size:18px; }.line small { font-size:10px; }footer { gap:15px; font-size:11px; }footer small { font-size:9px; }
    .is-conversation .master-card { min-height:115px; }.is-conversation h1 { font-size:25px; }.is-conversation .hero-copy>p:last-child { font-size:10px; }
  }
  @media(prefers-reduced-motion:reduce) { *,*::before,*::after { animation:none!important; transition:none!important; scroll-behavior:auto!important; } }
</style>`;
