
(function(){
"use strict";

/* =========================================================
   三一汽金 · AI 智能录单 Demo
   逻辑与原站等价：列表持久化、四步向导、客户 OCR 弹层、
   资产计算、AI 本地规则/大模型解析与双向填充。
   ========================================================= */

function $(s){return document.querySelector(s);}
function $all(s){return Array.prototype.slice.call(document.querySelectorAll(s));}

/** 顶部轻提示 */
function toast(m){
  var t=$("#toast");
  t.textContent=m;
  t.classList.add("show");
  clearTimeout(t._tm);
  t._tm=setTimeout(function(){t.classList.remove("show");},2200);
}
window.toast=toast;

/** 统一显隐（配合 .hidden） */
function setHidden(el, hide){
  if(!el) return;
  el.classList.toggle("hidden", !!hide);
}

function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function gCardHtml(name,phone,idNo){
  var isCorpG=/公司|有限合伙|事务所/.test(name||"");
  return "<div class='g-card2'><div class='g-left'><div class='g-avatar2"+(isCorpG?" corp":"")+"'>"+(isCorpG?"法人":"个人")+"</div>"+
    "<div class='g-ops'><button type='button' class='btn btn-danger btn-sm' data-toast='删除（演示）'>删除</button><button type='button' class='btn btn-primary btn-sm' data-toast='编辑（演示）'>编辑</button></div></div>"+
    "<div class='g-info2'><div class='g-name2'>"+esc(name)+"<span class='zx'>（征信2027-02-01到期）</span></div>"+
    "<div class='g-sub'><span><i class='mini'>☎</i>"+esc(phone||"--")+"</span><span><i class='mini'>证</i>"+esc(idNo||"--")+"</span></div></div></div>";
}

/** 状态标签配色：提升对比、便于扫读 */
function stClass(st){
  st=String(st||"");
  if(/已放款|面签成功|预审通过/.test(st)) return "st-tag st-ok";
  if(/已驳回|预审拒绝/.test(st)) return "st-tag st-danger";
  if(/审批中|变更中|预审中/.test(st)) return "st-tag st-warn";
  if(/保证金|待放款|待授权/.test(st)) return "st-tag st-proc";
  return "st-tag st-info";
}

/** 列表检索（查询按钮驱动；不改动示例数据本身） */
var listQuery={order:"",person:"",corp:""};
function rowMatch(obj,q){
  if(!q) return true;
  q=String(q).toLowerCase();
  return Object.keys(obj).some(function(k){
    if(k==="form") return false;
    return String(obj[k]==null?"":obj[k]).toLowerCase().indexOf(q)>=0;
  });
}

/** data-toast：替代原站内联 onclick="toast(...)" */
document.addEventListener("click",function(e){
  var t=e.target.closest("[data-toast]");
  if(t) toast(t.getAttribute("data-toast"));
});

/* ================= 数据（localStorage） ================= */
var DB={
  orders:JSON.parse(localStorage.getItem("v3_orders")||"null")||[
    {no:"20261029000715668",contract:"--",cust:"王学良",amt:"843,200",rate:"5%",term:"36期",attach:"挂靠",attacher:"郑州智运互联物流科技有限公司",prod:"新能源商用车(回租)5.00%按月等额本息",st:"已保存"},
    {no:"20261029000715678",contract:"--",cust:"孙伟锋",amt:"429,000",rate:"4.5%",term:"36期",attach:"挂靠",attacher:"许昌畅稳汽车运输有限公司",prod:"新能源商用车(回租)4.50%按月等额本息",st:"已保存"},
    {no:"20261028000715398",contract:"SFZ2026715458",cust:"黄柯程",amt:"760,000",rate:"4.5%",term:"30期",attach:"挂靠",attacher:"贵州亿诚物流有限责任公司",prod:"新能源商用车(回租)4.50%按月等额本息",st:"已保存"},
    {no:"20261031000716208",contract:"--",cust:"武安市天宇运输有限公司",amt:"4,100,000",rate:"4%",term:"24期",attach:"挂靠",attacher:"武安市天宇运输有限公司",prod:"新能源商用车(回租)4.00%按月等额本息",st:"已驳回"},
    {no:"20261030000716694",contract:"--",cust:"付文强",amt:"3,820,000",rate:"4.5%",term:"36期",attach:"挂靠",attacher:"贵州森途运输有限公司",prod:"新能源商用车(回租)4.50%按月等额本息",st:"已驳回"},
    {no:"20261029000715714",contract:"--",cust:"唐山市稳航运输有限公司",amt:"7,832,000",rate:"4%",term:"36期",attach:"挂靠",attacher:"唐山市稳航运输有限公司",prod:"新能源商用车(回租)4.00%按月等额本息",st:"已保存"},
    {no:"20261027000715112",contract:"--",cust:"刘光罗",amt:"429,000",rate:"4.2%",term:"36期",attach:"挂靠",attacher:"鄂尔多斯市富昌升商贸有限公司",prod:"新能源商用车(回租)4.20%按月等额本息",st:"已驳回"},
    {no:"20261025000714820",contract:"--",cust:"贾怀奇",amt:"945,000",rate:"4.5%",term:"24期",attach:"挂靠",attacher:"北京择山运输有限公司",prod:"新能源商用车(回租)4.50%按月等额本息",st:"已保存"},
    {no:"20261023000714102",contract:"--",cust:"冯海东",amt:"813,000",rate:"4.5%",term:"36期",attach:"挂靠",attacher:"天津德信通达物资有限公司",prod:"新能源商用车(回租)4.50%按月等额本息",st:"已保存"}
  ],
  persons:JSON.parse(localStorage.getItem("v3_persons")||"null")||[
    {name:"刘丽娟",id:"140321********0048",src:"微信小程序",marriage:"已婚",biz:"工厂担保业务",time:"2026-11-03 15:02:06",st:"待授权"},
    {name:"许公旺",id:"371525********0011",src:"h5",marriage:"已婚",biz:"工厂担保业务",time:"2026-11-03 14:45:40",st:"预审通过"},
    {name:"李芳",id:"142402********0614",src:"h5",marriage:"已婚",biz:"工厂担保业务",time:"2026-11-02 11:02:10",st:"预审通过"},
    {name:"张金林",id:"430821********0015",src:"业务系统",marriage:"已婚",biz:"工厂担保业务",time:"2026-11-02 10:40:22",st:"待授权"},
    {name:"李晓礼",id:"120222********0177",src:"h5",marriage:"已婚",biz:"工厂担保业务",time:"2026-11-02 09:18:33",st:"待授权"},
    {name:"赵建",id:"232627********0029",src:"h5",marriage:"已婚",biz:"工厂担保业务",time:"2026-11-01 16:22:05",st:"预审通过"}
  ],
  corps:JSON.parse(localStorage.getItem("v3_corps")||"null")||[
    {name:"滕州市鼎胜运输有限公司",code:"91370481MAKPPLM65",legal:"王蓬蓬",biz:"工厂担保业务",legalId:"370481********3859",st:"预审通过"},
    {name:"唐山市稳航运输有限公司",code:"91130283MAEDUB4T0M",legal:"张绍路",biz:"工厂担保业务",legalId:"130223********1119",st:"预审通过"},
    {name:"桐乡市实拓供应链管理有限公司",code:"91330483MAKPPTEU6X",legal:"刘耀日",biz:"工厂担保业务",legalId:"331122********3632",st:"预审通过"},
    {name:"宁波协鼎供应链管理有限公司",code:"91330206MAKNUH1684",legal:"刘芹",biz:"工厂担保业务",legalId:"330225********3914",st:"预审通过"},
    {name:"嘉兴程熙供应链管理有限公司",code:"91330401MAKRLLW39N",legal:"刘耀日",biz:"工厂担保业务",legalId:"331122********3632",st:"预审通过"},
    {name:"邯郸市正道运输有限公司",code:"91130402MA0G1L4QC11",legal:"程田",biz:"工厂担保业务",legalId:"132122********1816",st:"待授权"},
    {name:"宁夏聚鑫茂发运输有限公司",code:"91640100MACFX2X59A",legal:"杨保华",biz:"工厂担保业务",legalId:"342223********2075",st:"预审通过"},
    {name:"盐池鑫源盛工贸有限公司",code:"91640223MA76J5W448",legal:"朱江红",biz:"工厂担保业务",legalId:"640323********2028",st:"待授权"},
    {name:"会东鑫盛运输部",code:"92513426MA4CHK6T",legal:"刘代松",biz:"工厂担保业务",legalId:"513426********0510",st:"待授权"}
  ]
};
function saveDB(){localStorage.setItem("v3_orders",JSON.stringify(DB.orders));localStorage.setItem("v3_persons",JSON.stringify(DB.persons));localStorage.setItem("v3_corps",JSON.stringify(DB.corps));}

/* ================= 列表渲染 ================= */
function setCount(id,n){var el=document.getElementById(id);if(el)el.textContent="共 "+n+" 条";}
function opsCell(){
  return "<td class='ops'><button type='button' class='op-link' data-toast='预审信息（演示）'>预审信息</button><button type='button' class='op-link' data-toast='编辑（演示）'>编辑</button><button type='button' class='op-link' data-toast='预审记录（演示）'>预审记录</button><button type='button' class='op-link' data-toast='更多（演示）'>更多</button></td>";
}
function renderOrders(){
  var tb=$("#orderTable tbody");tb.innerHTML="";
  var n=0;
  DB.orders.forEach(function(o){
    if(!rowMatch(o,listQuery.order)) return;
    n++;
    var tr=document.createElement("tr");
    tr.innerHTML="<td class='link' data-editorder='"+esc(o.no)+"'>"+esc(o.no)+"</td><td>"+esc(o.contract)+"</td><td>"+esc(o.cust)+"</td><td>"+esc(o.amt)+"</td><td>"+esc(o.rate)+"</td><td>"+esc(o.term)+"</td><td>"+esc(o.attach)+"</td><td>"+esc(o.attacher)+"</td><td>--</td><td>"+esc(o.prod)+"</td><td><span class='"+stClass(o.st)+"'>"+esc(o.st)+"</span></td>"+
      "<td class='ops'><button type='button' class='op-link' data-toast='提交放款（演示）'>提交放款</button><button type='button' class='op-link' data-toast='编辑资产/附件（演示）'>编辑资产/附件</button><button type='button' class='op-link' data-editorder='"+esc(o.no)+"'>编辑</button><button type='button' class='op-link' data-toast='更多（演示）'>更多</button></td>";
    tb.appendChild(tr);
  });
  setCount("orderCount",n);
}
function renderPersons(){
  var tb=$("#personTable tbody");tb.innerHTML="";
  var n=0;
  DB.persons.forEach(function(p){
    if(!rowMatch(p,listQuery.person)) return;
    n++;
    var tr=document.createElement("tr");
    tr.innerHTML="<td>"+esc(p.name)+"</td><td>"+esc(p.id)+"</td><td>"+esc(p.src)+"</td><td>"+esc(p.marriage)+"</td><td>--</td><td>"+esc(p.biz)+"</td><td>"+esc(p.time)+"</td><td>--</td><td><span class='"+stClass(p.st)+"'>"+esc(p.st)+"</span></td>"+opsCell();
    tb.appendChild(tr);
  });
  setCount("personCount",n);
}
function renderCorps(){
  var tb=$("#corpTable tbody");tb.innerHTML="";
  var n=0;
  DB.corps.forEach(function(c){
    if(!rowMatch(c,listQuery.corp)) return;
    n++;
    var tr=document.createElement("tr");
    tr.innerHTML="<td>"+esc(c.name)+"</td><td>"+esc(c.code)+"</td><td>"+(esc(c.src||"h5"))+"</td><td>--</td><td>"+esc(c.legal)+"</td><td>"+esc(c.biz)+"</td><td>"+esc(c.legalId)+"</td><td>--</td><td>--</td><td><span class='"+stClass(c.st)+"'>"+esc(c.st)+"</span></td>"+opsCell();
    tb.appendChild(tr);
  });
  setCount("corpCount",n);
}
renderOrders();renderPersons();renderCorps();

/* 状态 Tab：仅切换高亮（原站如此；示例订单状态为「已保存」，与 Tab 文案不一一对应，故不按状态过滤） */
function bindTabs(id){
  var box=document.getElementById(id);if(!box)return;
  box.addEventListener("click",function(e){
    var t=e.target.closest(".stat-tab");if(!t)return;
    box.querySelectorAll(".stat-tab").forEach(function(x){x.classList.remove("on");});
    t.classList.add("on");
  });
}
bindTabs("orderTabs");bindTabs("personTabs");bindTabs("corpTabs");

function bindSearch(inputId,btnId,resetId,key,render){
  var input=$(inputId),btn=$(btnId),reset=$(resetId);
  if(btn) btn.addEventListener("click",function(){listQuery[key]=(input.value||"").trim();render();});
  if(reset) reset.addEventListener("click",function(){if(input)input.value="";listQuery[key]="";render();});
  if(input) input.addEventListener("keydown",function(e){if(e.key==="Enter"){listQuery[key]=(input.value||"").trim();render();}});
}
bindSearch("#orderSearch","#orderQueryBtn","#orderResetBtn","order",renderOrders);
bindSearch("#personSearch","#personQueryBtn","#personResetBtn","person",renderPersons);
bindSearch("#corpSearch","#corpQueryBtn","#corpResetBtn","corp",renderCorps);

/* ================= 视图切换 ================= */
var VIEWS=["orderList","personList","corpList","wizard"];
function show(v){
  VIEWS.forEach(function(x){setHidden(document.getElementById("view-"+x), x!==v);});
  var navKey=v==="wizard"?"orderList":v;
  $all(".nav-sub").forEach(function(n){
    var map={order:"orderList",person:"personList",corp:"corpList"};
    n.classList.toggle("active",map[n.dataset.nav]===navKey);
  });
  $all("#pageTabs .page-tab").forEach(function(t){
    t.classList.toggle("on", t.dataset.view===v);
  });
}
var pageTabs=$("#pageTabs");
if(pageTabs) pageTabs.addEventListener("click",function(e){
  var t=e.target.closest(".page-tab"); if(!t) return;
  if(e.target.closest(".tab-x")){
    if(t.classList.contains("on") && t.dataset.view!=="orderList") show("orderList");
    return;
  }
  var v=t.dataset.view;
  if(!v||v==="home"){show("orderList");return;}
  show(v);
});
$all(".nav-sub,.nav-item").forEach(function(n){
  n.addEventListener("click",function(){
    var k=n.dataset.nav;
    if(!k){toast("该模块不在本次 Demo 范围");return;}
    /* 原站点击「客户/担保」父级会落到法人列表；此处改为进入个人客户（该分组第一项） */
    var view=k==="order"?"orderList":k==="person"?"personList":k==="corp"?"corpList":k==="cust"?"personList":"orderList";
    show(view);
  });
});
$("#newOrderBtn").addEventListener("click",function(){editingOrderNo=null;resetWizard();show("wizard");});
$("#newPersonBtn").addEventListener("click",function(){openMask("personMask");});
$("#newCorpBtn").addEventListener("click",function(){openMask("corpMask");});
function openMask(id){document.getElementById(id).classList.add("show");}
function closeMask(id){document.getElementById(id).classList.remove("show");}
$all("[data-close]").forEach(function(b){b.addEventListener("click",function(){closeMask(b.dataset.close);});});

/* ================= 向导 ================= */
var curStep=1;
function updateSteps(){
  $all("#stepsBar .step-it").forEach(function(it,i){
    var s=i+1;it.classList.remove("on","done");
    if(s<curStep)it.classList.add("done");
    if(s===curStep)it.classList.add("on");
    setHidden(document.getElementById("step"+s), s!==curStep);
  });
  $("#prevBtn").disabled=curStep===1;
  $("#nextBtn").textContent=curStep===4?"提交":"下一步";
}
function gotoStep(n){curStep=Math.max(1,Math.min(4,n));updateSteps();}
$("#prevBtn").addEventListener("click",function(){gotoStep(curStep-1);});
$("#nextBtn").addEventListener("click",function(){if(curStep<4)gotoStep(curStep+1);else submitOrder();});
function resetWizard(){
  clearAiMarks();
  ["bizType","prodType","calcType","repayType","isDiscount","isBuyer","attachType","sameAttacher"].forEach(function(g){
    $all("#"+g+" .opt-tag, #"+g+" .radio-it").forEach(function(i){i.classList.remove("on");});
  });
  ["product","term","account","city"].forEach(function(id){document.getElementById(id).value="";});
  ["rate","custName","attacher"].forEach(function(id){document.getElementById(id).value="";});
  setHidden($("#prodTags"),true);setHidden($("#acctInfo"),true);
  $("#guarantorList").innerHTML="<div class='empty-tip'>暂无担保方信息，可点击添加</div>";
  $("#counterGList").innerHTML="<div class='empty-tip'>暂无反担保信息，可点击添加</div>";
  assets=[];renderAssets();renderAttChecklist();
  $("#checkStrip").innerHTML="[信息完整性提醒]：<span>合格证信息<b class='bad'>✗</b></span><span>发票信息<b class='bad'>✗</b></span><span>保单信息<b class='bad'>✗</b></span><span>信息一致性<b class='bad'>✗</b></span>";
  gotoStep(1);
}

/* ================= 选项组/单选组交互 ================= */
$all(".opt-tags,.radio-row").forEach(function(g){
  g.addEventListener("click",function(e){
    var t=e.target.closest(".opt-tag,.radio-it");
    if(!t||t.classList.contains("disabled"))return;
    t.parentNode.querySelectorAll(".opt-tag,.radio-it").forEach(function(i){i.classList.remove("on");});
    t.classList.add("on");
    if(g.id==="pMarriage")toggleSpouse();
  });
});
function toggleSpouse(){
  var sec=document.getElementById("spouseSec");
  if(sec)setHidden(sec, getGroup("pMarriage")!=="已婚");
}
function setGroup(id,val){
  var g=document.getElementById(id);if(!g)return false;
  var hit=false;
  g.querySelectorAll(".opt-tag,.radio-it").forEach(function(i){
    var on=i.dataset.val===val;i.classList.toggle("on",on);if(on)hit=true;
  });
  return hit;
}
function getGroup(id){
  var g=document.getElementById(id);var a=g&&g.querySelector(".opt-tag.on,.radio-it.on");
  return a?a.dataset.val:"";
}

/* ================= 收款账户联动 ================= */
var ACCT={
  "兴业银行(湖南汽车制造有限责任公司长沙分公司)":{bank:"兴业银行股份有限公司长沙星沙支行",no:"368180100100330669",union:"309551008185"},
  "三一汽车金融有限公司-建行长沙华兴支行":{bank:"中国建设银行股份有限公司长沙华兴支行",no:"4300152006105250****",union:"1055510000**"}
};
$("#account").addEventListener("change",function(){
  var a=ACCT[this.value];
  if(a){setHidden($("#acctInfo"),false);$("#acctBank").textContent=a.bank;$("#acctNo").textContent=a.no;$("#acctUnion").textContent=a.union;}
  else setHidden($("#acctInfo"),true);
});
$("#product").addEventListener("change",function(){setHidden($("#prodTags"), !this.value);});

/* ================= 资产 ================= */
var assets=[];
function renderAssets(){
  var box=$("#assetList");
  if(!assets.length){box.innerHTML="<div class='empty-tip'>暂无资产，请添加或由 AI 解析带入</div>";calcSum();return;}
  box.innerHTML="";
  assets.forEach(function(a,i){
    var loan=Math.round(a.price*a.ratio/100);
    var card=document.createElement("div");card.className="asset-card";
    function kv(k,v){return "<div class='asset-kv'><span>"+k+"</span><b>"+esc(v||"--")+"</b></div>";}
    function hasVal(v){v=v==null?"":String(v).trim();return !!(v && v!=="--" && v!=="待补录");}
    function seal(cls,label,ok){return "<div class='seal "+cls+(ok?" ok":"")+"'><i></i><span>"+label+(ok?" <b class='mark'>✓</b>":"")+"</span></div>";}
    card.innerHTML="<div class='asset-ico' aria-hidden='true'></div>"+
      "<div class='asset-main'><div class='asset-title'>"+(i+1)+"、"+esc(a.code)+"/"+esc(a.name)+"</div>"+
      "<div>销售金额："+Number(a.price).toLocaleString()+"</div>"+
      "<div>融资金额："+loan.toLocaleString()+"元<span class='pct-tag'>"+(Number(a.ratio)||0).toFixed(2)+"%</span></div>"+
      "<div>附加品融资比例：0%</div>"+
      "<div>挂靠方："+esc(a.attacher||"--")+"</div>"+
      "<div class='asset-ops'><button type='button' class='op-link asset-edit-btn' data-assetedit='"+i+"'>编辑</button><button type='button' class='op-link' data-toast='已复制资产（演示）'>复制</button><button type='button' class='op-link danger' data-toast='移除（演示）'>移除</button></div></div>"+
      "<div class='asset-side'>"+kv("合格证号",a.certNo)+kv("车架号",a.vin)+kv("发动机号",a.engineNo)+kv("整车编码",a.vehicleCode)+kv("燃料种类",a.fuel||"新能源")+"</div>"+
      "<div class='asset-seals'>"+seal("cert","合格证",hasVal(a.certNo))+seal("inv","发票",hasVal(a.invNo))+seal("ins","保单",hasVal(a.policyNo))+"</div>";
    box.appendChild(card);
  });
  calcSum();
}
function calcSum(){
  var sale=0,loan=0;
  assets.forEach(function(a){sale+=Number(a.price)||0;loan+=Math.round((Number(a.price)||0)*(Number(a.ratio)||0)/100);});
  function m(n){return (Number(n)||0).toLocaleString()+".00元";}
  $("#sumSale").textContent=m(sale);
  $("#sumLoan").textContent=m(loan);
  $("#sumDown").textContent=m(sale-loan);
  var lp=$("#sumLoanPct"), dp=$("#sumDownPct");
  if(lp){lp.textContent=sale?(loan/sale*100).toFixed(2)+"%":"0%";lp.style.display=sale?"inline-block":"none";}
  if(dp){dp.textContent=sale?((sale-loan)/sale*100).toFixed(2)+"%":"0%";dp.style.display=sale?"inline-block":"none";}
}
renderAssets();

/* ================= 附件清单（第四步） ================= */
var ATT_KINDS=["身份证","银行卡","征信报告","购车合同","婚姻证明","合格证","发票","保单","其他"];
var attachments=[];
var parseAtts=null; /* 本次解析的附件快照（发送即冻结，工作区清空） */
var chatHist=[]; /* 多轮上下文（最近4轮，随请求发给大模型） */
function classifyAtt(n){
  n=n.toLowerCase();
  if(/配偶|spouse/.test(n))return "配偶身份证";
  if(/身份证|idcard|id_card/.test(n))return "身份证";
  if(/合格证/.test(n))return "合格证";
  if(/发票|invoice/.test(n))return "发票";
  if(/保单|保险|insur/.test(n))return "保单";
  if(/银行卡|bank/.test(n))return "银行卡";
  if(/担保|户口|离婚|房产/.test(n))return "担保材料";
  if(/征信|credit/.test(n))return "征信报告";
  if(/合同|contract|协议/.test(n))return "购车合同";
  if(/未婚|单身|婚姻/.test(n))return "婚姻证明";
  if(/执照|license/.test(n))return "营业执照";
  return "其他";
}
var MAT_GROUPS=[
  {t:"买卖合同/销售意向表",kinds:["购车合同"]},
  {t:"个人担保方材料",kinds:["担保材料","身份证","配偶身份证","营业执照"]},
  {t:"其它信审材料",kinds:["征信报告","银行卡","婚姻证明","其他"]}
];
var matKind="其他";
function renderAttChecklist(){
  var box=$("#attChecklist");if(!box)return;
  var pool=(typeof attPool==="function")?attPool():attachments;
  var html="";
  MAT_GROUPS.forEach(function(g,gi){
    html+="<div class='mat-group'><div class='mg-t'>"+g.t+"<span class='ic'>ⓘ</span></div><div class='mat-row'>";
    pool.forEach(function(a){
      if(g.kinds.indexOf(a.kind)<0)return;
      var inner=a.dataUrl?"<img src='"+a.dataUrl+"' alt=''>":(/\.pdf$/i.test(a.name)?"<div class='pdf-ic'>PDF</div>":"<div class='mat-ph'>📄</div>");
      html+="<div class='mat-thumb'><span class='del' data-delname='"+esc(a.name)+"'>×</span><div class='th'>"+inner+"</div><div class='nm' title='"+esc(a.name)+"'>"+esc(a.name)+"</div></div>";
    });
    html+="<div class='mat-add' data-gi='"+gi+"' title='上传"+g.t+"'>+</div></div></div>";
  });
  box.innerHTML=html;
}
function renderFileTags(){
  var box=$("#fileTags");box.innerHTML="";
  attachments.forEach(function(a,i){
    var t=document.createElement("span");t.className="file-tag";
    t.innerHTML="📄 "+esc(a.name)+" <span class='kind'>["+a.kind+"]</span> <b class='x'>×</b>";
    t.querySelector(".x").addEventListener("click",function(){attachments.splice(i,1);renderFileTags();renderAttChecklist();});
    box.appendChild(t);
  });
}
$("#attBtn").addEventListener("click",function(){$("#attInput").click();});
$("#attInput").addEventListener("change",function(e){
  Array.prototype.forEach.call(e.target.files,function(f){
    if(f.size>10*1024*1024){toast("「"+f.name+"」超过10MB，已跳过");return;}
    var item={name:f.name,kind:classifyAtt(f.name),dataUrl:null};
    if(item.kind==="其他"&&/^image\//.test(f.type))item.kind="担保材料"; /* 未识别出类型的图片默认进「个人担保方材料」 */
    if(/^image\//.test(f.type)){
      var rd=new FileReader();
      rd.onload=function(ev){
        var img=new Image();
        img.onload=function(){
          var s=Math.min(1,1024/Math.max(img.width,img.height));
          if(s>=1){item.dataUrl=ev.target.result;}
          else{var cv=document.createElement("canvas");cv.width=Math.round(img.width*s);cv.height=Math.round(img.height*s);cv.getContext("2d").drawImage(img,0,0,cv.width,cv.height);item.dataUrl=cv.toDataURL("image/jpeg",0.75);}
        };
        img.src=ev.target.result;
      };
      rd.readAsDataURL(f);
    }
    attachments.push(item);
  });
  renderFileTags();renderAttChecklist();e.target.value="";
});
$("#boxFileInput").addEventListener("change",function(e){
  var f=e.target.files&&e.target.files[0];e.target.value="";
  if(!f||!boxTarget)return;
  if(f.size>10*1024*1024){toast("文件超过10MB，已跳过");return;}
  var box=boxTarget;
  var item={name:f.name,kind:box.dataset.kind||"其他",dataUrl:null};
  attPool().push(item);
  if(/^image\//.test(f.type)){
    var rd=new FileReader();
    rd.onload=function(ev){
      var img=new Image();
      img.onload=function(){
        var s=Math.min(1,1024/Math.max(img.width,img.height));
        if(s>=1){item.dataUrl=ev.target.result;}
        else{var cv=document.createElement("canvas");cv.width=Math.round(img.width*s);cv.height=Math.round(img.height*s);cv.getContext("2d").drawImage(img,0,0,cv.width,cv.height);item.dataUrl=cv.toDataURL("image/jpeg",0.75);}
        setBoxImage(box.id,item,box.dataset.ph);
      };
      img.src=ev.target.result;
    };
    rd.readAsDataURL(f);
  }else{
    setBoxImage(box.id,item,box.dataset.ph);
  }
  renderFileTags();renderAttChecklist();
});

$("#matFileInput").addEventListener("change",function(e){
  var files=e.target.files;e.target.value="";
  if(!files||!files.length)return;
  Array.prototype.forEach.call(files,function(f){
    if(f.size>10*1024*1024){toast("「"+f.name+"」超过10MB，已跳过");return;}
    var item={name:f.name,kind:matKind,dataUrl:null};
    if(/^image\//.test(f.type)){
      var rd=new FileReader();
      rd.onload=function(ev){
        var img=new Image();
        img.onload=function(){
          var sc=Math.min(1,1024/Math.max(img.width,img.height));
          if(sc>=1){item.dataUrl=ev.target.result;}
          else{var cv=document.createElement("canvas");cv.width=Math.round(img.width*sc);cv.height=Math.round(img.height*sc);cv.getContext("2d").drawImage(img,0,0,cv.width,cv.height);item.dataUrl=cv.toDataURL("image/jpeg",0.75);}
          renderAttChecklist();
        };
        img.src=ev.target.result;
      };
      rd.readAsDataURL(f);
    }
    attPool().push(item);
  });
  renderFileTags();renderAttChecklist();
  toast("已上传到「"+matKind+"」");
});

/* ================= AI 标记 ================= */
function markField(key,conf){
  var w=document.querySelector('[data-field="'+key+'"]');if(!w)return;
  var tag=w.querySelector(".ai-tag");
  if(tag&&typeof conf==="number"){
    var pct=Math.round(conf*100);
    tag.textContent="AI "+pct+"%";
    tag.className="ai-tag "+(conf>=0.85?"high":conf>=0.6?"mid":"low");
  }else if(tag){tag.textContent="AI 填充";tag.className="ai-tag high";}
  w.classList.add("ai-flash");
  var inp=w.querySelector(".f-input,.f-select");
  if(inp&&typeof conf==="number"&&conf<0.6)inp.classList.add("warn");
  setTimeout(function(){w.classList.remove("ai-flash");},1200);
}
function clearAiMarks(){
  $all("[data-field]").forEach(function(w){
    w.classList.remove("ai-flash");
    var t=w.querySelector(".ai-tag");if(t)t.className="ai-tag";
    var inp=w.querySelector(".f-input,.f-select");if(inp)inp.classList.remove("warn");
  });
}

/* ================= 配置 ================= */
function loadCfg(){try{return JSON.parse(localStorage.getItem("v3_cfg")||"{}");}catch(e){return{};}}
$("#cfgBtn").addEventListener("click",function(){var p=$("#cfgPanel");setHidden(p, !p.classList.contains("hidden"));});
$("#newSessBtn").addEventListener("click",function(){
  chatHist=[];lastParse=null;parseAtts=null;attachments=[];window._pendingAssign=null;
  $("#chatInput").value="";$("#chatBody").innerHTML="";
  renderFileTags();renderAttChecklist();
  addMsg("ai","🧹 已开始新会话，上下文已清空。把客户信息、融资需求、附件丢给我吧。");
  toast("已清空上下文");
});
(function(){
  var c=loadCfg();
  $("#cfgBase").value=c.base||"";$("#cfgKey").value=c.key||"";$("#cfgModel").value=c.model||"";$("#cfgVision").checked=!!c.vision;
  $all("#cfgPanel input").forEach(function(el){el.addEventListener("change",function(){
    localStorage.setItem("v3_cfg",JSON.stringify({base:$("#cfgBase").value.trim(),key:$("#cfgKey").value.trim(),model:$("#cfgModel").value.trim(),vision:$("#cfgVision").checked}));
  });});
})();

$all("[data-m]").forEach(function(b){b.addEventListener("click",function(){
  $("#cfgModel").value=b.dataset.m;
  $("#cfgModel").dispatchEvent(new Event("change"));
  toast("已填入模型："+b.dataset.m);
});});
$("#cfgTestBtn").addEventListener("click",function(){
  var msg=$("#cfgTestMsg");
  var base=cleanToken($("#cfgBase").value).replace(/\/+$/,"");
  var key=cleanToken($("#cfgKey").value);
  var model=cleanToken($("#cfgModel").value);
  if(!base||!key){msg.textContent="请先填接口地址和 Key";msg.style.color="#cf1322";return;}
  if(!model){msg.textContent="请填模型名（百炼当前型号：qwen3.7-plus / qwen3.8-max / qwen3.8-flash）";msg.style.color="#cf1322";return;}
  msg.textContent="测试中…";msg.style.color="#8a8f99";
  var ctrl=new AbortController();var tm=setTimeout(function(){ctrl.abort();},20000);
  fetch(base+"/chat/completions",{
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":"Bearer "+key},
    body:JSON.stringify({model:model,messages:[{role:"user",content:"ping"}],max_tokens:1}),
    signal:ctrl.signal
  }).then(function(r){clearTimeout(tm);
    if(r.ok){msg.textContent="✅ 连接成功，模型可用";msg.style.color="#2a9d3f";return;}
    return r.text().then(function(t){
      msg.textContent="❌ HTTP "+r.status+"（模型="+model+"）："+t.substring(0,100);msg.style.color="#cf1322";
      fetch(base+"/models",{headers:{"Authorization":"Bearer "+key}}).then(function(r2){
        if(!r2.ok)return;
        return r2.json().then(function(j){
          var ids=(j.data||[]).map(function(x){return x.id;}).filter(function(x){return /qwen/i.test(x);}).slice(0,8);
          if(ids.length)msg.textContent+=" ｜ 你的 Key 可用模型："+ids.join("、");
        });
      }).catch(function(){});
    });
  }).catch(function(e){clearTimeout(tm);msg.textContent="❌ "+String(e&&e.message||e)+"（跨域拦截需本地代理）";msg.style.color="#cf1322";});
});

/* ================= 聊天 ================= */
/* ============ AI 浮窗（可拖动，位置记忆） ============ */
(function(){
  var fab=$("#aiFab"),drawer=$("#aiDrawer");
  function applyPos(side,top){
    if(side==="left"){fab.style.left="22px";fab.style.right="auto";}
    else{fab.style.left="auto";fab.style.right="22px";}
    fab.classList.toggle("edge-left",side==="left");
    drawer.classList.toggle("edge-left",side==="left");
    fab.style.bottom="auto";fab.style.top=Math.max(60,Math.min(window.innerHeight-fab.offsetHeight-6,top))+"px";
  }
  var saved=null;
  try{saved=JSON.parse(localStorage.getItem("v3_fabPos")||"null");}catch(e){}
  if(saved&&saved.side)applyPos(saved.side,Number(saved.top)||window.innerHeight-90);
  var sx=0,sy=0,ox=0,oy=0,moved=false,dragging=false;
  function down(x,y){
    var r=fab.getBoundingClientRect();
    sx=x;sy=y;ox=r.left;oy=r.top;moved=false;dragging=true;
    fab.classList.add("dragging");
  }
  function move(x,y){
    if(!dragging)return;
    if(Math.abs(x-sx)+Math.abs(y-sy)>6)moved=true;
    if(!moved)return;
    var w=fab.offsetWidth,h=fab.offsetHeight;
    var nx=Math.max(6,Math.min(window.innerWidth-w-6,ox+(x-sx)));
    var ny=Math.max(60,Math.min(window.innerHeight-h-6,oy+(y-sy)));
    fab.style.left=nx+"px";fab.style.right="auto";fab.style.top=ny+"px";fab.style.bottom="auto";
  }
  function up(){
    if(!dragging)return;dragging=false;
    fab.classList.remove("dragging");
    if(!moved){drawer.classList.toggle("open");return;}
    var r=fab.getBoundingClientRect();
    var side=(r.left+r.width/2)<window.innerWidth/2?"left":"right";
    applyPos(side,Math.round(r.top));
    localStorage.setItem("v3_fabPos",JSON.stringify({side:side,top:Math.round(r.top)}));
  }
  fab.addEventListener("mousedown",function(e){e.preventDefault();down(e.clientX,e.clientY);});
  document.addEventListener("mousemove",function(e){move(e.clientX,e.clientY);});
  document.addEventListener("mouseup",up);
  fab.addEventListener("touchstart",function(e){var t=e.touches[0];down(t.clientX,t.clientY);},{passive:true});
  fab.addEventListener("touchmove",function(e){var t=e.touches[0];move(t.clientX,t.clientY);if(moved)e.preventDefault();},{passive:false});
  fab.addEventListener("touchend",up);
})();
$("#aiClose").addEventListener("click",function(){$("#aiDrawer").classList.remove("open");});
/* ============ 抽屉高度拖拽 ============ */
(function(){
  var drawer=$("#aiDrawer"),handle=$("#aiResize");
  var savedTop=Number(localStorage.getItem("v3_drawerTop")||0);
  function setTop(t){
    t=Math.max(52,Math.min(window.innerHeight-180,t));
    drawer.style.top=t+"px";
    return t;
  }
  if(savedTop)setTop(savedTop);
  var startY=0,startTop=0,on=false;
  function down(y){startY=y;startTop=drawer.getBoundingClientRect().top;on=true;handle.classList.add("dragging");}
  function move(y){
    if(!on)return;
    var t=setTop(startTop+(y-startY));
    localStorage.setItem("v3_drawerTop",String(Math.round(t)));
  }
  function up(){on=false;handle.classList.remove("dragging");}
  handle.addEventListener("mousedown",function(e){e.preventDefault();down(e.clientY);});
  document.addEventListener("mousemove",function(e){move(e.clientY);});
  document.addEventListener("mouseup",up);
  handle.addEventListener("touchstart",function(e){down(e.touches[0].clientY);},{passive:true});
  handle.addEventListener("touchmove",function(e){e.preventDefault();move(e.touches[0].clientY);},{passive:false});
  handle.addEventListener("touchend",up);
})();
function addMsg(role,html){
  var d=document.createElement("div");d.className="msg "+role;
  d.innerHTML="<div class='bubble'>"+html+"</div>";
  $("#chatBody").appendChild(d);$("#chatBody").scrollTop=$("#chatBody").scrollHeight;
  return d;
}

/* ================= 字段 Schema（LLM + 本地解析共用） ================= */
var PRODUCTS=["仅厂担-商用车-零售新车-回租-新能源-普通产品3.0","双担保-工程机械-零售新机-回租-燃油-泵路大客户专项产品（5台）2.0","零售二手车-按揭-标准产品"];
var ACCOUNTS=["兴业银行(湖南汽车制造有限责任公司长沙分公司)","三一汽车金融有限公司-建行长沙华兴支行"];
var SCHEMA_TXT=
"customerType(客户类型:个人/法人)；"+
"customer:{name,idNo(身份证),gender(男/女),nation(民族),addr(住址),valid(身份证有效期),marriage(未婚/已婚/离异/丧偶),phone,email,preLoan(预贷款金额,万元纯数字)}；"+
"corp:{corpName(公司名称),creditCode(统一社会信用代码),legalName,legalIdNo,legalGender,legalNation,legalAddr,legalValid,legalPhone,email,preLoan}（仅法人类客户输出）；"+
"guarantor:{name,phone,idNo}（担保人，没有则不输出）；spouse:{name,idNo,gender,nation,addr,valid}（客户已婚时输出配偶证件信息，没有则不输出）；"+
"order:{bizType(零售新车/商用车库融/零售二手车/存量机构/外部零售新车/外部零售二手车),prodType(按揭/回租/直租/库融),calcType(等额本息/等额本金),repayType(按月等额本息/前N月（1-6）还息不还本等额本息/按季等额本息/冬歇期等额本息),product(金融产品，可选值："+PRODUCTS.join("｜")+"),rate(利率纯数字如5或4.5),term(期数纯数字:12/24/36/48/60),isDiscount(是/否),account(收款账户，可选值："+ACCOUNTS.join("｜")+"),isBuyer(是/否),attachType(非挂靠/挂靠/委托挂靠),sameAttacher(是/否),attacher(挂靠方公司名),city(备案城市)}；"+
"asset:{name(车型/设备名),price(单台销售金额,元纯数字),count(台数纯数字),ratio(融资比例%纯数字,默认80),fuel(燃料种类)}"+
"assetDoc:{certNo(合格证号码),vin(车架号),engineNo(发动机号),vehicleCode(整车编码),invType(发票类型:电子发票/纸质发票/机动车销售统一发票),invTitle(发票抬头),invNo(发票编号),invAmount(发票金额,元纯数字),insCo(保险公司),policyNo(保单号),insStart(保险期限起,YYYY-MM-DD),insEnd(保险期限止,YYYY-MM-DD),insLoc(保险公司所在地)}（附件含合格证/发票/保单图片时OCR输出）";

/* ================= 本地规则兜底解析 ================= */
function localParse(text){
  var f={},c={};
  function put(path,v,cf){if(v!==undefined&&v!==null&&v!==""){f[path]=v;c[path]=conf;}}
  function P(path,v,cf){if(v!==undefined&&v!==null&&String(v)!==""){f[path]=v;c[path]=cf;}}
  var m;
  /* 客户类型 */
  var isCorp=/统一社会信用代码|营业执照|有限公司.{0,10}(法人|法定代表)|法人客户/.test(text)&&!/客户.{0,6}(身份证|先生|女士)/.test(text);
  P("customerType",isCorp?"法人":"个人",0.7);
  /* 身份证 */
  var idM=text.match(/(?:^|[^\d])(\d{17}[\dXx])(?![\dXx])/);
  /* 担保人身份证（第二个出现的身份证号） */
  var idAll=text.match(/\d{17}[\dXx]/g)||[];
  /* 名称 */
  if(!isCorp){m=text.match(/客户[：: ]{0,2}([一-龥]{2,4})/)||text.match(/([一-龥]{2,3})(?:女士|先生)/)||text.match(/(?:姓名|名称)[：:是 ]{0,3}([一-龥]{2,4})/);
  if(m)P("customer.name",m[1],0.85);}
  if(idM){
    P("customer.idNo",idM[1].toUpperCase(),0.98);
    P("customer.idGender",Number(idM[1].substr(16,1))%2===1?"男":"女",0.9);
  }
  if(/男/.test(text)&&!f["customer.idGender"])P("customer.idGender","男",0.7);
  m=text.match(/([一-龥]{1,3}族)/);if(m)P("customer.nation",m[1],0.85);
  m=text.match(/(?:住址|家住|住在|现住|地址)[：:是 ]?([一-龥0-9A-Za-z]{4,}(?:路|街|大道|镇|乡|村|小区|广场|花园|栋|号)[一-龥0-9A-Za-z栋单元室号]*)/);
  if(m)P("customer.addr",m[1],0.7);
  m=text.match(/有效期[：: ]?([0-9\.\-~至]{10,25})/);if(m)P("customer.valid",m[1],0.65);
  m=text.match(/(?:^|[^\d])(1[3-9]\d{9})(?!\d)/);if(m)P("customer.phone",m[1],0.95);
  m=text.match(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/);if(m)P("customer.email",m[1],0.95);
  if(/已婚/.test(text)&&!/未婚/.test(text))P("customer.marriage","已婚",0.9);
  else if(/未婚/.test(text))P("customer.marriage","未婚",0.9);
  else if(/离异/.test(text))P("customer.marriage","离异",0.85);
  else if(/丧偶/.test(text))P("customer.marriage","丧偶",0.85);
  /* 法人字段（仅法人类客户抽取，避免把挂靠公司误当法人客户） */
  if(isCorp){
    m=text.match(/([一-龥]{4,}(?:有限公司|有限责任公司|运输部|供应链管理有限公司))/);if(m)P("corp.corpName",m[1],0.8);
    m=text.match(/([0-9A-Z]{18})/);if(m&&/[A-Z]/.test(m[1])&&/\d/.test(m[1]))P("corp.creditCode",m[1],0.85);
    m=text.match(/(?:法定代表人|法人代表|法人(?!客户))[：:是 ]{0,3}([一-龥]{2,4})/);if(m)P("corp.legalName",m[1],0.85);
    if(idM){P("corp.legalIdNo",idM[1].toUpperCase(),0.9);P("corp.legalGender",Number(idM[1].substr(16,1))%2===1?"男":"女",0.85);}
  }
  /* 担保人 */
  m=text.match(/担保人?[：:是 ]{0,3}([一-龥]{2,4})/);
  if(m){
    P("guarantor.name",m[1],0.8);
    var gm=text.match(/担保.{0,30}?((?:1[3-9]\d{9}))/);
    if(gm&&gm[1]!==(f["customer.phone"]||""))P("guarantor.phone",gm[1],0.7);
    var gid=text.match(/担保.{0,60}?(\d{17}[\dXx])/);
    if(gid)P("guarantor.idNo",gid[1].toUpperCase(),0.8);
    else if(idAll.length>1)P("guarantor.idNo",idAll[1].toUpperCase(),0.7);
  }
  /* 配偶（已婚客户需录入配偶身份证） */
  m=text.match(/配偶[：:是 ]{0,3}([一-龥]{2,4})/);
  if(m){
    P("spouse.name",m[1],0.8);
    var sm=text.match(/配偶.{0,60}?(\d{17}[\dXx])/);
    if(sm){P("spouse.idNo",sm[1].toUpperCase(),0.8);P("spouse.idGender",Number(sm[1].substr(16,1))%2===1?"男":"女",0.85);}
    else{
      var usedIds=[f["customer.idNo"],f["guarantor.idNo"]];
      for(var ii=0;ii<idAll.length;ii++){
        var cand=idAll[ii].toUpperCase();
        if(usedIds.indexOf(cand)<0){P("spouse.idNo",cand,0.6);P("spouse.idGender",Number(cand.substr(16,1))%2===1?"男":"女",0.6);break;}
      }
    }
  }
  /* 未指明关系的多余身份证：交给用户确认谁是借款人 */
  var extras=[];
  if(!isCorp&&!f["spouse.idNo"]&&!f["guarantor.idNo"]){
    for(var ei=0;ei<idAll.length;ei++){
      var eid=idAll[ei].toUpperCase();
      if(eid!==(f["customer.idNo"]||""))extras.push({idNo:eid,gender:Number(eid.substr(16,1))%2===1?"男":"女"});
    }
  }
  /* ===== 订单字段 ===== */
  if(/库融/.test(text))P("order.bizType","商用车库融",0.85);
  else if(/存量/.test(text))P("order.bizType","存量机构",0.85);
  else if(/外部/.test(text)&&/二手/.test(text))P("order.bizType","外部零售二手车",0.8);
  else if(/外部/.test(text))P("order.bizType","外部零售新车",0.8);
  else if(/二手/.test(text))P("order.bizType","零售二手车",0.85);
  else if(/新车|新车|新设备/.test(text))P("order.bizType","零售新车",0.85);
  if(/回租/.test(text))P("order.prodType","回租",0.9);
  else if(/直租/.test(text))P("order.prodType","直租",0.9);
  else if(/库融/.test(text))P("order.prodType","库融",0.9);
  else if(/按揭/.test(text))P("order.prodType","按揭",0.9);
  if(/等额本金/.test(text))P("order.calcType","等额本金",0.9);
  else if(/等额本息/.test(text))P("order.calcType","等额本息",0.9);
  if(/冬歇/.test(text))P("order.repayType","冬歇期等额本息",0.9);
  else if(/还息不还本|前\s*[1-6一二三四五六]\s*月/.test(text))P("order.repayType","前N月（1-6）还息不还本等额本息",0.85);
  else if(/按季/.test(text))P("order.repayType","按季等额本息",0.9);
  else if(/按月/.test(text))P("order.repayType","按月等额本息",0.8);
  if(/新能源|普通产品/.test(text))P("order.product",PRODUCTS[0],0.7);
  else if(/泵路|大客户专项/.test(text))P("order.product",PRODUCTS[1],0.8);
  else if(/二手/.test(text)&&/按揭/.test(text))P("order.product",PRODUCTS[2],0.75);
  m=text.match(/利率[：: ]?(\d+(?:\.\d+)?)\s*%?/);if(m)P("order.rate",m[1],0.85);
  m=text.match(/(\d{1,2})\s*(?:期|个月)/);if(m)P("order.term",m[1],0.85);
  if(/不贴息|无贴息/.test(text))P("order.isDiscount","否",0.85);
  else if(/贴息/.test(text))P("order.isDiscount","是",0.75);
  if(/兴业/.test(text))P("order.account",ACCOUNTS[0],0.8);
  else if(/建行|华兴/.test(text))P("order.account",ACCOUNTS[1],0.8);
  if(/非实际购买人|不是实际购买人/.test(text))P("order.isBuyer","否",0.8);
  else if(/实际购买人/.test(text))P("order.isBuyer","是",0.8);
  if(/委托挂靠/.test(text))P("order.attachType","委托挂靠",0.85);
  else if(/非挂靠|不挂靠/.test(text))P("order.attachType","非挂靠",0.85);
  else if(/挂靠/.test(text))P("order.attachType","挂靠",0.75);
  m=text.match(/挂靠(?:方|公司)?[：:是 ]{0,3}([一-龥]{4,}(?:有限公司|有限责任公司))/);if(m)P("order.attacher",m[1],0.85);
  if(f["order.attacher"])P("order.sameAttacher","是",0.6);
  m=text.match(/备案城市[：: ]?([一-龥]{2,4})/);if(m)P("order.city",m[1],0.7);
  /* 资产 */
  m=text.match(/(\d+)\s*(?:台|辆)/);
  var cnt=m?Number(m[1]):1;
  var nameM=text.match(/((?:充电|纯电|燃油|柴油|氢能)?[一-龥A-Za-z0-9]{2,}(?:牵引车|自卸车|搅拌车|载货车|轻卡|重卡|挖掘机|装载机|泵车|起重机)(?:（[^）]*）)?)/);
  var priceM=text.match(/(?:单车|单价|每台|每辆|销售价格|销售金额|车价)[：: ]?(\d+(?:\.\d+)?)\s*万/)||text.match(/(\d+(?:\.\d+)?)\s*万[，, ]*(?:一台|每|单价|\/台)/);
  var ratioM=text.match(/融资(?:比例|成数)[：: ]?(\d{1,3})\s*%/)||(/首付[^0-9]{0,4}(?:两|2)\s*成/.test(text)||/首付20/.test(text)?[null,"80"]:null);
  if(nameM||priceM){
    var aName=nameM?nameM[1].replace(/^[^充纯燃柴氢一-龥]*(?:台|辆)|^.*?(?:台|辆)/,""):"牵引车";
    P("asset.name",aName,0.75);
    if(priceM)P("asset.price",String(Math.round(parseFloat(priceM[1])*10000)),0.8);
    P("asset.count",String(cnt),cnt>1?0.85:0.5);
    P("asset.ratio",ratioM?ratioM[1]:"80",ratioM?0.8:0.5);
    if(/充电|纯电|新能源/.test(text))P("asset.fuel","新能源",0.8);
  }
  /* 资产单证（合格证/发票/保单） */
  m=text.match(/\b([A-HJ-NPR-Z0-9]{17})\b/);if(m)P("assetDoc.vin",m[1],0.9);
  m=text.match(/发动机号[：: ]?([A-Za-z0-9]{5,17})/);if(m)P("assetDoc.engineNo",m[1],0.85);
  m=text.match(/合格证[号码号]*[：: ]?([A-Za-z0-9]{6,20})/);if(m)P("assetDoc.certNo",m[1],0.85);
  m=text.match(/(?:整车编码|车辆识别代号)[：: ]?([A-Za-z0-9]{6,20})/);if(m)P("assetDoc.vehicleCode",m[1],0.8);
  m=text.match(/发票[编号号码]*[：: ]?(\d{8,20})/);if(m)P("assetDoc.invNo",m[1],0.85);
  m=text.match(/发票金额[：: ]?(\d+(?:\.\d+)?)/);if(m)P("assetDoc.invAmount",m[1],0.8);
  m=text.match(/发票抬头[：: ]?([一-龥]{2,}(?:公司|中心|站|厂)?)/);if(m)P("assetDoc.invTitle",m[1],0.75);
  m=text.match(/(中国人保财险|人保财险|中国平安财险|平安财险|太平洋财险|国寿财险|大地财险|中华联合财险|阳光财险)/);if(m)P("assetDoc.insCo",m[1],0.8);
  m=text.match(/保单号[：: ]?([A-Za-z0-9]{8,25})/);if(m)P("assetDoc.policyNo",m[1],0.85);
  var im2=text.match(/保险期限[：: ]?(\d{4}[-\.\/]\d{1,2}[-\.\/]\d{1,2})\s*(?:至|到|~|—|-)\s*(\d{4}[-\.\/]\d{1,2}[-\.\/]\d{1,2})/);
  if(im2){P("assetDoc.insStart",im2[1],0.8);P("assetDoc.insEnd",im2[2],0.8);}
  /* 预贷款金额（万） */
  m=text.match(/(?:预贷款|贷款金额|融资金额|融资总额|贷款)[^0-9]{0,6}(\d+(?:\.\d+)?)\s*万/);
  if(m)P("customer.preLoan",m[1],0.8);
  else if(f["asset.price"]){var tot=Number(f["asset.price"])*Number(f["asset.count"]||1)*Number(f["asset.ratio"]||80)/100;P("customer.preLoan",String(Math.round(tot/10000*100)/100),0.55);}
  return {fields:f,confidence:c,extraIds:extras,notes:["本地规则解析结果（未连接大模型）；黄色/未填字段请人工核对或补充附件。"]};
}

/* ================= 大模型解析 ================= */
function cleanToken(v){return (v||"").replace(/[\s\u200B-\u200D\uFEFF]/g,"");}
function llmParse(text,atts,hist){
  var cfg=loadCfg();
  var base=cleanToken(cfg.base).replace(/\/+$/,"");
  var model=cleanToken(cfg.model)||(function(){
    if(/dashscope\.aliyuncs\.com|maas\.aliyuncs\.com/.test(base))return "qwen3.7-plus";
    if(/deepseek/.test(base))return "deepseek-chat";
    if(/volces\.com|ark/.test(base))return cfg.vision?"doubao-vision-pro-32k":"doubao-pro-32k";
    return "deepseek-chat";
  })();
  var sys="你是三一汽车金融订单与客户信息抽取助手。从录单素材（文本+附件图片）中抽取字段，严格输出 JSON：{\"fields\":{\"扁平路径\":\"值\"},\"confidence\":{\"扁平路径\":0到1},\"notes\":[\"需人工注意项\"]}。"+
  "字段路径如 customer.name、order.bizType、asset.price、guarantor.name。字段定义："+SCHEMA_TXT+"。规则：1)枚举严格取可选值；2)金额按定义单位输出纯数字；3)无依据字段不要输出，不要编造；4)附件含身份证/营业执照图片时识别其中文字填充对应字段；5)身份证图片默认视为个人客户证件（customerType=个人），仅当素材中出现营业执照或统一社会信用代码时才判为法人客户，此时身份证视为法人身份证，填入 corp.* 字段；6)素材中出现2张及以上不同身份证时，仅当文本明确说明身份关系（如配偶/担保人/法人）才按关系填充，否则把主要人物填 customer.*，其余身份证人员输出到顶层 extraIds 数组（元素含 name,idNo,gender,nation,addr,valid），不要臆测身份关系；7)性别优先按身份证号第17位推导（奇数男、偶数女），无法推导时按人像面「性别」栏识别，填入 gender 字段；8)顶层输出 imgSides 数组，按图片顺序标注每张图片属于：身份证人像面/身份证国徽面/配偶身份证人像面/配偶身份证国徽面/营业执照/合格证/发票/交强险保单/商业险保单/其他；9)你可以看到对话历史：用户可能分多轮补充素材、修正字段或明确身份关系（如「罗静是借款人」），每轮都要结合历史输出截至目前的完整字段集合，不要只输出增量；用户明确身份关系后据此调整 customer/spouse/guarantor 归属并清空 extraIds，确认配偶后输出 customer.marriage=已婚。";
  var userContent=[{type:"text",text:"录单素材：\n"+text+(atts.length?"\n附件清单："+atts.map(function(a){return a.name+"（"+a.kind+"）";}).join("、"):"")}];
  if(cfg.vision)atts.forEach(function(a){if(a.dataUrl)userContent.push({type:"image_url",image_url:{url:a.dataUrl}});});
  var ctrl=new AbortController();var tm=setTimeout(function(){ctrl.abort();},120000);
  return fetch(base+"/chat/completions",{
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":"Bearer "+cleanToken(cfg.key)},
    body:JSON.stringify({model:model,messages:[{role:"system",content:sys}].concat(hist||[]).concat([{role:"user",content:userContent}]),temperature:0.1,response_format:{type:"json_object"},enable_thinking:false}),
    signal:ctrl.signal
  }).then(function(r){clearTimeout(tm);if(!r.ok)return r.text().then(function(t){throw new Error("HTTP "+r.status+"（发送的模型名="+model+"）"+(t?"："+t.substring(0,140):""));});return r.json();})
  .then(function(j){
    var ct=j.choices&&j.choices[0]&&j.choices[0].message&&j.choices[0].message.content;
    if(!ct)throw new Error("模型返回为空");
    var r=JSON.parse(ct);
    try{
      var imgs=atts.filter(function(a){return a.dataUrl;});
      (r.imgSides||[]).forEach(function(sd,i){
        var a=imgs[i];if(!a||!sd)return;
        if(/营业执照/.test(sd))a.kind="营业执照";
        else if(/合格证/.test(sd))a.kind="合格证";
        else if(/发票/.test(sd))a.kind="发票";
        else if(/保单/.test(sd))a.kind="保单";
        else if(/身份证/.test(sd)){
          a.kind=/配偶/.test(sd)?"配偶身份证":"身份证";
          if(/人像/.test(sd))a.side="front";else if(/国徽/.test(sd))a.side="back";
        }
      });
    }catch(e){}
    return r;
  });
}

/* ================= 扁平路径读取 ================= */
function fv(fields,path){return fields[path];}

/* ================= 文件栏（缩略图/点传/删除） ================= */
function attPool(){return parseAtts||attachments;}
function attsOf(kind){return attPool().filter(function(a){return a.kind===kind;});}
function sidesOf(kind){
  var front=null,back=null;
  attsOf(kind).forEach(function(a){
    var sd=a.side||( /国徽|背面|back/i.test(a.name)?"back":/人像|正面|front/i.test(a.name)?"front":null );
    if(sd==="back"){if(!back)back=a;else if(!front)front=a;}
    else if(sd==="front"){if(!front)front=a;else if(!back)back=a;}
    else if(!front)front=a;else if(!back)back=a;
  });
  return {front:front,back:back};
}
function idSides(){return sidesOf("身份证");}
function setBoxImage(boxId,att,phText,doneNoImg){
  var box=document.getElementById(boxId);if(!box)return;
  if(att){
    box.classList.add("done","has-img");
    box.innerHTML="<span class='del' data-delbox='"+boxId+"' data-delname='"+esc(att.name)+"'>×</span>"+
      (att.dataUrl?"<img src='"+att.dataUrl+"' alt=''>":"<div class='mat-ph'>📄</div>")+
      "<div class='box-cap'>"+esc(att.name)+"</div>";
  }else if(doneNoImg){
    box.classList.add("done");box.classList.remove("has-img");
    box.innerHTML="<div class='plus'>✅</div><div>识别完成</div>";
  }else{
    box.classList.remove("done","has-img");
    box.innerHTML="<div class='plus'>＋</div><div>"+esc(phText||"上传")+"</div>";
  }
}
var boxTarget=null;
document.addEventListener("click",function(e){
  var del=e.target.closest(".del");
  if(del){
    e.stopPropagation();
    var nm=del.dataset.delname;
    [attachments,parseAtts].forEach(function(arr){if(!arr)return;var i=arr.findIndex(function(a){return a.name===nm;});if(i>=0)arr.splice(i,1);});
    if(del.dataset.delbox){
      var bx=document.getElementById(del.dataset.delbox);
      setBoxImage(del.dataset.delbox,null,(bx&&bx.dataset.ph)||"上传");
    }
    renderFileTags();renderAttChecklist();
    return;
  }
  var madd=e.target.closest(".mat-add");
  if(madd){
    matKind=MAT_GROUPS[Number(madd.dataset.gi)].kinds[0];
    var mi=document.getElementById("matFileInput");if(mi)mi.click();
    return;
  }
  var bx2=e.target.closest(".ocr-box[data-upload]");
  if(bx2){boxTarget=bx2;var inp=document.getElementById("boxFileInput");if(inp)inp.click();}
});
/* ================= 填充：录客户弹窗 ================= */
function setOcr(id,v,ok){
  var el=document.getElementById(id);
  if(v){el.textContent=v;el.className="v "+(ok===false?"wait":"ok");}
}
function fillPersonModal(fields,confidence){
  openMask("personMask");
  var seq=0;
  function step(fn){setTimeout(fn,seq);seq+=160;}
  if(fv(fields,"customer.marriage"))step(function(){setGroup("pMarriage",fv(fields,"customer.marriage"));markField("pMarriage",confidence["customer.marriage"]);});
  step(function(){
    var ids=idSides();
    if(!ids.front&&!ids.back){var oth=sidesOf("其他");if(oth.front||oth.back)ids=oth;}
    var hasId=ids.front||ids.back||fv(fields,"customer.idNo");
    setBoxImage("pIdFront",ids.front,"客户身份证人像面",!!hasId&&!ids.front);
    setBoxImage("pIdBack",ids.back,"客户身份证国徽面",!!hasId&&!ids.back);
  });
  step(function(){setOcr("pIdName",fv(fields,"customer.name"));setOcr("pIdNo",fv(fields,"customer.idNo"));setOcr("pIdGender",fv(fields,"customer.idGender")||fv(fields,"customer.gender"));setOcr("pIdNation",fv(fields,"customer.nation"));setOcr("pIdAddr",fv(fields,"customer.addr"));});
  step(function(){
    if(fv(fields,"customer.idNo")&&/^\d{17}[\dXx]$/i.test(fv(fields,"customer.idNo"))){
      var id=fv(fields,"customer.idNo");
      var by=Number(id.substr(6,4)),bm=Number(id.substr(10,2)),bd=Number(id.substr(12,2));
      var now=new Date();var age=now.getFullYear()-by-((now.getMonth()+1<bm||(now.getMonth()+1===bm&&now.getDate()<bd))?1:0);
      setOcr("pIdAge",age+" 岁（推算）");
    }
    setOcr("pIdValid",fv(fields,"customer.valid"));
  });
  if(fv(fields,"customer.phone"))step(function(){$("#pPhone").value=fv(fields,"customer.phone");markField("pPhone",confidence["customer.phone"]);});
  if(fv(fields,"customer.email"))step(function(){$("#pEmail").value=fv(fields,"customer.email");markField("pEmail",confidence["customer.email"]);});
  if(fv(fields,"customer.preLoan"))step(function(){$("#pPreLoan").value=fv(fields,"customer.preLoan");markField("pPreLoan",confidence["customer.preLoan"]);});
  step(function(){setBoxImage("pSingleBox",attsOf("婚姻证明")[0]||null,"未婚材料证明");});
  step(function(){
    toggleSpouse();
    var sp=sidesOf("配偶身份证");
    var hasSp=sp.front||sp.back||fv(fields,"spouse.idNo");
    setBoxImage("sIdFront",sp.front,"配偶身份证人像面",!!hasSp&&!sp.front);
    setBoxImage("sIdBack",sp.back,"配偶身份证国徽面",!!hasSp&&!sp.back);
    if(hasSp)markField("spouse",confidence["spouse.idNo"]||0.8);
  });
  step(function(){setOcr("sIdName",fv(fields,"spouse.name"));setOcr("sIdNo",fv(fields,"spouse.idNo"));setOcr("sIdGender",fv(fields,"spouse.idGender")||fv(fields,"spouse.gender"));setOcr("sIdNation",fv(fields,"spouse.nation"));setOcr("sIdAddr",fv(fields,"spouse.addr"));setOcr("sIdValid",fv(fields,"spouse.valid"));});
}
function fillCorpModal(fields,confidence){
  openMask("corpMask");
  var seq=0;function step(fn){setTimeout(fn,seq);seq+=160;}
  step(function(){
    var lic=attsOf("营业执照")[0]||null;var hasLic=lic||fv(fields,"corp.creditCode");
    setBoxImage("cLicenseBox",lic,"营业执照",!!hasLic&&!lic);
  });
  step(function(){setOcr("cCorpName",fv(fields,"corp.corpName"));setOcr("cCreditCode",fv(fields,"corp.creditCode"));});
  step(function(){
    var ids2=idSides();var hasId=ids2.front||ids2.back||fv(fields,"corp.legalIdNo");
    setBoxImage("cIdFront",ids2.front,"法人身份证人像面",!!hasId&&!ids2.front);
    setBoxImage("cIdBack",ids2.back,"法人身份证国徽面",!!hasId&&!ids2.back);
    setOcr("cLegalName",fv(fields,"corp.legalName"));setOcr("cLegalIdNo",fv(fields,"corp.legalIdNo"));
    setOcr("cLegalGender",fv(fields,"corp.legalGender"));setOcr("cLegalNation",fv(fields,"corp.legalNation"));
    setOcr("cLegalAddr",fv(fields,"corp.legalAddr"));setOcr("cLegalValid",fv(fields,"corp.legalValid"));
  });
  if(fv(fields,"corp.legalPhone")||fv(fields,"customer.phone"))step(function(){$("#cPhone").value=fv(fields,"corp.legalPhone")||fv(fields,"customer.phone");markField("cPhone",0.8);});
  if(fv(fields,"corp.preLoan")||fv(fields,"customer.preLoan"))step(function(){$("#cPreLoan").value=fv(fields,"corp.preLoan")||fv(fields,"customer.preLoan");markField("cPreLoan",0.8);});
  if(fv(fields,"corp.email")||fv(fields,"customer.email"))step(function(){$("#cEmail").value=fv(fields,"corp.email")||fv(fields,"customer.email");markField("cEmail",0.8);});
}

/* ================= 填充：订单向导 ================= */
function fillOrderWizard(fields,confidence){
  resetWizard();show("wizard");
  var g1=["bizType","prodType","calcType","repayType","product","rate","term","isDiscount","account"];
  var i=0;
  function fillK(k){
    var v=fv(fields,"order."+k);if(v===undefined||v==="")return;
    var cf=confidence["order."+k];
    if(["bizType","prodType","calcType","repayType","isDiscount"].indexOf(k)>=0){if(!setGroup(k,v))return;}
    else{var el=document.getElementById(k);if(!el)return;el.value=v;if(el.value!==v)return;if(k==="product")setHidden($("#prodTags"),false);if(k==="account")el.dispatchEvent(new Event("change"));}
    markField(k,cf);
  }
  function next1(){
    if(i>=g1.length){
      setTimeout(function(){
        gotoStep(2);
        var g2=["custName","isBuyer","attachType","sameAttacher","attacher","city"];var j=0;
        function fillK2(k){
          var path=k==="custName"?"customer.name":"order."+k;
          var v=fv(fields,path);if(v===undefined||v==="")return;
          var cf=confidence[path];
          if(["isBuyer","attachType","sameAttacher"].indexOf(k)>=0){if(!setGroup(k,v))return;}
          else{var el=document.getElementById(k);if(!el)return;el.value=v;}
          markField(k,cf);
        }
        (function next2(){
          if(j>=g2.length){fillGuarantor();fillAssets();setTimeout(function(){gotoStep(1);toast("AI 填充完成，请核对");},600);return;}
          fillK2(g2[j++]);setTimeout(next2,170);
        })();
      },450);
      return;
    }
    fillK(g1[i++]);setTimeout(next1,170);
  }
  function fillGuarantor(){
    var gn=fv(fields,"guarantor.name");
    if(!gn)return;
    var html=gCardHtml(gn,fv(fields,"guarantor.phone"),fv(fields,"guarantor.idNo"));
    $("#guarantorList").innerHTML=html;
    $("#counterGList").innerHTML=html;
    markField("guarantor",confidence["guarantor.name"]);
  }
  function fillAssets(){
    var nm=fv(fields,"asset.name");
    if(!nm)return;
    var price=Number(fv(fields,"asset.price")||0);
    var cnt=Math.max(1,Number(fv(fields,"asset.count")||1));
    var ratio=Number(fv(fields,"asset.ratio")||80);
    var att=fv(fields,"order.attacher")||"";
    var d=new Date();function p(n){return (n<10?"0":"")+n;}
    assets=[];
    for(var k=0;k<cnt;k++){
      assets.push({code:"ZCBH"+d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+"00071"+(5600+k),name:nm,price:price,ratio:ratio,attacher:att,fuel:fv(fields,"asset.fuel")||"新能源"});
    }
    renderAssets();
  }
  next1();
}

/* ================= 解析主流程 ================= */
$("#parseBtn").addEventListener("click",function(){
  var text=$("#chatInput").value.trim();
  if(!text&&!attachments.length){toast("请先输入素材或点击「填入示例」");return;}
  if(text&&window._routeSnap){
    var hit=null;
    DB.orders.forEach(function(o){if(text.indexOf(o.no)>=0||(o.cust&&text.indexOf(o.cust)>=0))hit=o;});
    if(hit||/当前|编辑中|这个订单/.test(text)){
      $("#chatInput").value="";
      addMsg("user",esc(text));
      handleOrderRoute({dataset:{orderno:hit?hit.no:"__current__"},closest:function(){return null;}});
      return;
    }
  }
  var cfg=loadCfg();
  var btn=$("#parseBtn");btn.disabled=true;btn.textContent="解析中…";
  parseAtts=attachments.slice();attachments=[];$("#chatInput").value="";renderFileTags();renderAttChecklist();
  addMsg("user",esc(text.substring(0,140))+(text.length>140?"…":"")+(parseAtts.length?"<br>📎 "+parseAtts.map(function(a){return a.name+"["+a.kind+"]";}).join("、"):""));
  var status=addMsg("ai","⏳ 正在"+(cfg.key&&cfg.base?"调用大模型":"使用本地规则")+"解析素材"+(parseAtts.some(function(a){return a.dataUrl;})?"（多图 OCR 约需 1~2 分钟，请耐心等待）":"")+"，请稍候…");
  var t0=Date.now();
  var parseText=text;
  if(parseAtts.some(function(a){return a.kind==="营业执照";})&&!/营业执照|统一社会信用代码/.test(text))parseText+="\n（附件含营业执照）";
  var pr=(cfg.key&&cfg.base)
    ?llmParse(parseText,parseAtts,chatHist).catch(function(err){var r=localParse(parseText);var em=String(err&&err.message||err);if(/abort/i.test(em))em="请求超时（>120秒），多图识别较慢，可重试";r._err=em;r._local=true;return r;})
    :new Promise(function(res){setTimeout(function(){var r=localParse(parseText);r._local=true;res(r);},900);});
  pr.then(function(result){
    var fields=result.fields||{};var confidence=result.confidence||{};
    if(result._local&&lastParse&&lastParse.fields){
      Object.keys(lastParse.fields).forEach(function(k){if(fields[k]===undefined)fields[k]=lastParse.fields[k];});
      Object.keys(lastParse.confidence||{}).forEach(function(k){if(confidence[k]===undefined)confidence[k]=lastParse.confidence[k];});
    }
    lastParse={fields:fields,confidence:confidence};
    chatHist.push({role:"user",content:parseText+(parseAtts.length?"（附件："+parseAtts.map(function(a){return a.name+"["+a.kind+"]";}).join("、")+"）":"")});
    chatHist.push({role:"assistant",content:JSON.stringify({fields:fields,extraIds:result.extraIds||[]}).substring(0,1500)});
    if(chatHist.length>8)chatHist=chatHist.slice(-8);
    var n=Object.keys(fields).length;
    var cost=((Date.now()-t0)/1000).toFixed(1);
    var isCorp=fv(fields,"customerType")==="法人";
    var lows=Object.keys(confidence).filter(function(k){return confidence[k]<0.6;}).map(function(k){return k.split(".").pop();});
    var html=(result._err?("⚠️ 大模型调用失败（"+esc(result._err)+"），已切换本地解析。<br>"):"✅ 解析完成。<br>")+
      "识别到 <b>"+(isCorp?"法人客户":"个人客户")+"</b> 素材，共抽取 <b>"+n+" 个字段</b>，耗时 "+cost+"s。"+
      (lows.length?"<br>⚠️ 低置信度字段建议核对："+esc(lows.slice(0,6).join("、")):"")+
      (result.notes&&result.notes.length?"<br>📌 "+result.notes.map(esc).join("；"):"")+
      "<br><br>接下来："+
      "<br><button class='act-btn' data-act='fillCust'>① 填充到「录"+(isCorp?"法人":"个人")+"客户」弹窗</button>"+
      "<button class='act-btn' data-act='fillOrder'>② 填充到「录订单」向导</button>"+
      "<br><span class='chat-tip'>建议先 ① 录客户并保存，再 ② 录订单</span>";
    status.querySelector(".bubble").innerHTML=html;
    $("#chatBody").scrollTop=$("#chatBody").scrollHeight;
    try{console.log("[v3] parse result:",JSON.stringify(result).substring(0,900));}catch(e){}
    var extras=normExtras(result);
    if(!isCorp&&fv(fields,"customer.idNo")&&!fv(fields,"spouse.idNo")){
      if(extras.length){result.extraIds=extras;askBorrower(result);}
      else if(attPool().filter(function(a){return a.kind==="身份证";}).length>=3){
        result.extraIds=[{name:"",idNo:""}];askBorrower(result);
      }
    }
    askOrderRoute();
  }).catch(function(err){
    status.querySelector(".bubble").innerHTML="❌ 解析失败："+esc(String(err&&err.message||err))+"，请重试。";
  }).then(function(){btn.disabled=false;btn.textContent="AI 智能解析";});
});
function normExtras(result){
  var f=result.fields||{};
  var ex=result.extraIds||result.extra_ids||result.extraids||(result.data&&(result.data.extraIds||result.data.extra_ids))||f["extraIds"]||f["extraids"]||[];
  if(typeof ex==="string"){try{ex=JSON.parse(ex);}catch(e){ex=[];}}
  if(!Array.isArray(ex))ex=[];
  delete f["extraIds"];delete f["extraids"];
  if(!ex.length){
    var tmp={};
    Object.keys(f).forEach(function(k){
      var m=k.match(/^extraIds?[\.\[]?(\d+)[\.\]]?\.?(\w+)$/i);
      if(m){(tmp[m[1]]=tmp[m[1]]||{})[m[2]]=f[k];delete f[k];}
    });
    ex=Object.keys(tmp).sort().map(function(i){return tmp[i];});
  }
  return ex.filter(function(x){return x&&(x.idNo||x.name);});
}
function askBorrower(result){
  var f=result.fields;
  var ppl=[{name:fv(f,"customer.name")||"证件①",idNo:fv(f,"customer.idNo"),src:"customer",idx:-1}];
  (result.extraIds||[]).forEach(function(x,i){ppl.push({name:x.name||("证件"+(i+2)),idNo:x.idNo,src:"extra",idx:i});});
  var h="🪪 检测到 <b>"+ppl.length+" 份身份证</b>，素材未说明身份关系——谁是 <b>借款人</b>？<br>";
  ppl.forEach(function(p,i){h+="<button class='act-btn' data-act='assign' data-idx='"+i+"'>"+esc(p.name)+"（"+esc(maskId(p.idNo))+"）</button>";});
  h+="<br><span class='chat-tip'>选定后另一人自动录为配偶（婚姻状况设为已婚），证件照片同步归位。也可以直接打字告诉我，如「罗静是借款人」</span>";
  addMsg("ai",h);
  window._pendingAssign={result:result,ppl:ppl};
}
function reassignIdImages(borrowerFirst){
  var pool=attPool().filter(function(a){return a.kind==="身份证";});
  if(pool.length<2)pool=pool.concat(attPool().filter(function(a){return a.kind==="其他";}));
  if(pool.length<2)return;
  var half=Math.ceil(pool.length/2);
  var g1=pool.slice(0,half),g2=pool.slice(half);
  (borrowerFirst?g2:g1).forEach(function(a){a.kind="配偶身份证";});
  (borrowerFirst?g1:g2).forEach(function(a){if(a.kind==="配偶身份证")a.kind="身份证";});
  renderFileTags();renderAttChecklist();
}
function handleAssign(b){
  var pa=window._pendingAssign;if(!pa)return;window._pendingAssign=null;
  var idx=Number(b.dataset.idx)||0;
  var res=pa.result,f=res.fields,borrower=pa.ppl[idx];
  if(borrower.src==="extra"){
    var ex=res.extraIds[borrower.idx]||{};
    var oldC={name:fv(f,"customer.name"),idNo:fv(f,"customer.idNo"),gender:fv(f,"customer.gender")||fv(f,"customer.idGender"),nation:fv(f,"customer.nation"),addr:fv(f,"customer.addr"),valid:fv(f,"customer.valid")};
    f["customer.name"]=ex.name||oldC.name;f["customer.idNo"]=ex.idNo||oldC.idNo;
    f["customer.gender"]=ex.gender;delete f["customer.idGender"];
    f["customer.nation"]=ex.nation;f["customer.addr"]=ex.addr;f["customer.valid"]=ex.valid;
    f["spouse.name"]=oldC.name;f["spouse.idNo"]=oldC.idNo;f["spouse.gender"]=oldC.gender;f["spouse.nation"]=oldC.nation;f["spouse.addr"]=oldC.addr;f["spouse.valid"]=oldC.valid;
  }else{
    var ex2=(res.extraIds||[])[0]||{};
    f["spouse.name"]=ex2.name;f["spouse.idNo"]=ex2.idNo;f["spouse.gender"]=ex2.gender;f["spouse.nation"]=ex2.nation;f["spouse.addr"]=ex2.addr;f["spouse.valid"]=ex2.valid;
  }
  delete f["spouse.idGender"];
  f["customer.marriage"]="已婚";
  res.extraIds=[];
  reassignIdImages(idx===0);
  lastParse={fields:f,confidence:res.confidence||{}};
  chatHist.push({role:"user",content:"（确认）"+(f["customer.name"]||"借款人")+"是借款人，"+(f["spouse.name"]||"另一人")+"是配偶"});
  chatHist.push({role:"assistant",content:JSON.stringify({fields:f}).substring(0,1500)});
  if(chatHist.length>8)chatHist=chatHist.slice(-8);
  var bb=b.closest(".bubble");if(bb)bb.querySelectorAll("button").forEach(function(x){x.disabled=true;x.style.opacity=".45";});
  addMsg("ai","✅ 已确认：<b>"+esc(f["customer.name"]||"借款人")+"</b> 为借款人，<b>"+esc(f["spouse.name"]||"另一人")+"</b> 录为配偶（已婚）。<br><br><button class='act-btn' data-act='fillCust'>① 填充到「录个人客户」弹窗</button><button class='act-btn' data-act='fillOrder'>② 填充到「录订单」向导</button>");
}
/* ================= 材料归属（按订单归集） ================= */
var ORDER_STORE=JSON.parse(localStorage.getItem("v3_orderStore")||"{}");
function saveOrderStore(){try{localStorage.setItem("v3_orderStore",JSON.stringify(ORDER_STORE));}catch(e){}}
var DOC_KINDS=["合格证","发票","保单"];
var ID_KINDS=["身份证","配偶身份证","营业执照"];
function detectRouteNeeds(){
  var pool=parseAtts||[];if(!pool.length)return null;
  var docs=pool.filter(function(a){return DOC_KINDS.indexOf(a.kind)>=0;});
  var contracts=pool.filter(function(a){return a.kind==="购车合同";});
  var others=pool.filter(function(a){return DOC_KINDS.indexOf(a.kind)<0&&ID_KINDS.indexOf(a.kind)<0&&a.kind!=="购车合同";});
  if(!docs.length&&!contracts.length&&!others.length)return null;
  return {docs:docs,contracts:contracts,others:others};
}
function askOrderRoute(){
  var r=detectRouteNeeds();if(!r)return;
  var parts=[];
  if(r.docs.length)parts.push("🧾 <b>"+r.docs.map(function(a){return a.kind;}).join("、")+"</b>：选择订单后，按「车架号」匹配至对应资产信息");
  if(r.contracts.length)parts.push("📑 <b>设备买卖合同</b>：选择订单后，上传到「附件：买卖合同/销售意向表」");
  if(r.others.length)parts.push("📎 <b>"+r.others.map(function(a){return a.kind;}).join("、")+"</b>：选择订单后，上传到订单信审材料");
  var h="📂 识别到以下材料，请告诉我归属哪个订单：<br>"+parts.join("<br>")+"<br>";
  h+="<button class='act-btn' data-orderno='__current__'>✏️ 当前编辑中的订单</button>";
  DB.orders.forEach(function(o){h+="<button class='act-btn ghost' data-orderno='"+esc(o.no)+"'>"+esc(o.cust)+"｜"+esc(o.no)+"</button>";});
  h+="<br><span class='chat-tip'>也可以直接打字告诉我，如「上传到王学良的订单」</span>";
  window._routeSnap=r;
  addMsg("ai",h);
}
function handleOrderRoute(btn){
  var no=btn.dataset.orderno;var isCur=no==="__current__";
  var o=isCur?null:DB.orders.filter(function(x){return x.no===no;})[0];
  if(!isCur&&!o){toast("未找到订单");return;}
  var r=window._routeSnap||detectRouteNeeds();
  if(!r){toast("没有待归集的材料（请重新发送附件）");return;}
  window._routeSnap=null;
  var f=(lastParse&&lastParse.fields)||{};
  var vin=fv(f,"assetDoc.vin");
  var label=isCur?("当前编辑中的订单（"+($("#custName").value||"未填客户名")+"）"):(o.cust+"｜"+o.no);
  var msgs=[];
  /* 1) 合格证/发票/保单 → 按车架号匹配资产 */
  if(r.docs.length){
    var dk=r.docs.map(function(a){return a.kind;}).join("、");
    if(isCur){
      var hit=null;
      if(vin)assets.forEach(function(a){if(a.vin&&a.vin===vin)hit=a;});
      if(hit){
        if(fv(f,"assetDoc.certNo"))hit.certNo=fv(f,"assetDoc.certNo");
        if(fv(f,"assetDoc.engineNo"))hit.engineNo=fv(f,"assetDoc.engineNo");
        renderAssets();
        msgs.push("✅ "+dk+"：车架号 <b>"+esc(vin)+"</b> 与资产「"+esc(hit.name)+"」一致，合格证号/发动机号等字段已写入该资产");
      }else if(vin){
        msgs.push("⚠️ "+dk+"：识别到车架号 <b>"+esc(vin)+"</b>，但当前订单资产中没有相同车架号，已挂为待核对材料，请人工确认");
      }else if(assets.length){
        var seq=null;
        assets.forEach(function(a){if(!seq&&!a.certNo)seq=a;});
        if(!seq)seq=assets[0];
        if(fv(f,"assetDoc.certNo"))seq.certNo=fv(f,"assetDoc.certNo");
        if(fv(f,"assetDoc.engineNo"))seq.engineNo=fv(f,"assetDoc.engineNo");
        if(fv(f,"assetDoc.vin")&&!seq.vin)seq.vin=fv(f,"assetDoc.vin");
        renderAssets();
        msgs.push("✅ "+dk+"：未识别到车架号，已按资产顺序匹配至「"+esc(seq.name)+"」（第 "+(assets.indexOf(seq)+1)+" 台），单证字段已写入，请人工核对");
      }else{
        msgs.push("⚠️ "+dk+"：当前订单还没有资产，已挂到订单附件，请先在第3步添加资产");
      }
    }else{
      var st=ORDER_STORE[no]=ORDER_STORE[no]||{docs:[],atts:[]};
      r.docs.forEach(function(a){st.docs.push({name:a.name,kind:a.kind,vin:vin||"",certNo:fv(f,"assetDoc.certNo")||"",engineNo:fv(f,"assetDoc.engineNo")||""});});
      saveOrderStore();
      msgs.push(vin?("✅ "+dk+"：已按车架号 <b>"+esc(vin)+"</b> 匹配至订单「"+esc(label)+"」的对应资产，单证字段已写入")
                   :("✅ "+dk+"：未识别到车架号，已按订单「"+esc(label)+"」内资产顺序匹配，建议人工核对"));
    }
  }
  /* 2) 设备买卖合同 → 买卖合同/销售意向表 */
  if(r.contracts.length){
    if(!isCur){var st2=ORDER_STORE[no]=ORDER_STORE[no]||{docs:[],atts:[]};r.contracts.forEach(function(a){st2.atts.push({name:a.name,kind:a.kind,group:"买卖合同/销售意向表"});});saveOrderStore();}
    msgs.push("✅ 设备买卖合同：已上传到「"+esc(label)+"」的附件：买卖合同/销售意向表");
  }
  /* 3) 其他材料 → 订单附件 */
  if(r.others.length){
    var ok=r.others.map(function(a){return a.kind;}).join("、");
    if(!isCur){var st3=ORDER_STORE[no]=ORDER_STORE[no]||{docs:[],atts:[]};r.others.forEach(function(a){st3.atts.push({name:a.name,kind:a.kind,group:"信审材料"});});saveOrderStore();}
    msgs.push("✅ "+ok+"：已上传到「"+esc(label)+"」的订单附件（信审材料）");
  }
  var bb=btn.closest(".bubble");if(bb)bb.querySelectorAll("button").forEach(function(x){x.disabled=true;x.style.opacity=".45";});
  chatHist.push({role:"user",content:"（归集）材料归属订单："+label});
  if(chatHist.length>8)chatHist=chatHist.slice(-8);
  addMsg("ai","归属订单：<b>"+esc(label)+"</b><br>"+msgs.join("<br>"));
}
var lastParse=null;
$("#chatBody").addEventListener("click",function(e){
  var ob=e.target.closest("[data-orderno]");
  if(ob){handleOrderRoute(ob);return;}
  var b=e.target.closest("[data-act]");if(!b)return;
  if(b.dataset.act==="assign"){handleAssign(b);return;}
  if(!lastParse)return;
  var isCorp=fv(lastParse.fields,"customerType")==="法人";
  if(b.dataset.act==="fillCust"){
    if(isCorp)fillCorpModal(lastParse.fields,lastParse.confidence);
    else fillPersonModal(lastParse.fields,lastParse.confidence);
  }else if(b.dataset.act==="fillOrder"){
    $("#aiDrawer").classList.remove("open");
    fillOrderWizard(lastParse.fields,lastParse.confidence);
  }
});

/* ================= 添加资产弹窗 ================= */
var AMAP={certNo:"aCertNo",vin:"aVin",engineNo:"aEngine",vehicleCode:"aVehicle",invType:"aInvType",invTitle:"aInvTitle",invNo:"aInvNo",invAmount:"aInvAmount",insCo:"aInsCo",policyNo:"aPolicyNo",insStart:"aInsStart",insEnd:"aInsEnd",insLoc:"aInsLoc"};
function amCalc(){
  var pr=Number($("#aPrice").value)||0,ln=Number($("#aLoan").value)||0;
  $("#amSale").textContent=pr.toLocaleString()+".00元";
  $("#amLoan").textContent=ln.toLocaleString()+".00元";
  $("#amDown").textContent=(pr-ln).toLocaleString()+".00元";
  $("#amRatio").textContent=(pr?Math.round(ln/pr*100):0)+"%";
}
function setSelLike(sel,v){
  if(!v)return;
  for(var j=0;j<sel.options.length;j++){var t=sel.options[j].text;if(t.indexOf(v)>=0||v.indexOf(t)>=0){sel.selectedIndex=j;return;}}
}
var editingAssetIdx=null;
var AFIELDS=["aPrice","aLoan","aCertModel","aContractModel","aCertNo","aVin","aEngine","aVehicle","aInvTitle","aInvNo","aInvAmount","aPolicyNo","aInsStart","aInsEnd","aInsLoc"];
function resetAssetForm(){
  AFIELDS.forEach(function(id){var el=document.getElementById(id);if(el)el.value="";});
  ["aType","aInvType","aInsCo"].forEach(function(id){var el=document.getElementById(id);if(el)el.selectedIndex=0;});
  setBoxImage("aCertBox",null,"合格证");setBoxImage("aInvBox",null,"发票");setBoxImage("aInsBox",null,"交强险保单");
  amCalc();
}
function openAssetForm(idx){
  editingAssetIdx=(typeof idx==="number")?idx:null;
  resetAssetForm();
  document.querySelector("#assetMask .m-hd .t").textContent=(editingAssetIdx===null?"添加资产":"编辑资产");
  openMask("assetMask");
  if(editingAssetIdx!==null){
    var ea=assets[editingAssetIdx];if(!ea)return;
    $("#aContractModel").value=ea.name||"";
    $("#aCertModel").value=ea.certModel||ea.name||"";
    setSelLike($("#aType"),String(ea.name||""));
    $("#aPrice").value=ea.price||"";
    $("#aLoan").value=Math.round((ea.price||0)*(ea.ratio||80)/100)||"";
    Object.keys(AMAP).forEach(function(k){
      var v=ea[k];if(v===undefined||v===null||v==="")return;
      var el=document.getElementById(AMAP[k]);if(!el)return;
      if(el.tagName==="SELECT")setSelLike(el,String(v));else el.value=v;
    });
    amCalc();
    return;
  }
  var f=(lastParse&&lastParse.fields)||{};
  var nm=fv(f,"asset.name");
  if(nm){
    $("#aContractModel").value=nm;
    $("#aCertModel").value=nm;
    setSelLike($("#aType"),String(nm));
  }
  if(fv(f,"asset.price"))$("#aPrice").value=fv(f,"asset.price");
  if(fv(f,"asset.price")){var ratio=Number(fv(f,"asset.ratio")||80);$("#aLoan").value=Math.round(Number(fv(f,"asset.price"))*ratio/100);}
  Object.keys(AMAP).forEach(function(k){
    var v=fv(f,"assetDoc."+k);if(v===undefined||v==="")return;
    var el=document.getElementById(AMAP[k]);if(!el)return;
    if(el.tagName==="SELECT")setSelLike(el,String(v));else el.value=v;
  });
  setBoxImage("aCertBox",attsOf("合格证")[0]||null,"合格证");
  setBoxImage("aInvBox",attsOf("发票")[0]||null,"发票");
  setBoxImage("aInsBox",attsOf("保单")[0]||null,"交强险保单");
  amCalc();
}
$("#addAssetBtn").addEventListener("click",function(){openAssetForm();});
$("#assetList").addEventListener("click",function(e){
  var eb=e.target.closest("[data-assetedit]");if(!eb)return;
  openAssetForm(Number(eb.dataset.assetedit));
});
$("#aPrice").addEventListener("input",amCalc);
$("#aLoan").addEventListener("input",amCalc);
$("#assetSaveBtn").addEventListener("click",function(){
  var price=Number($("#aPrice").value)||0;
  var loan=Number($("#aLoan").value)||0;
  if(!price){toast("请填写资产交易价格");return;}
  if(loan>price){toast("贷款金额不能超过交易价格");return;}
  var ratio=price?Math.round(loan/price*100):80;
  var nm=$("#aContractModel").value.trim()||$("#aType").value||"牵引车";
  var d=new Date();function pd(n){return (n<10?"0":"")+n;}
  var rec={
    code:"ZCBH"+d.getFullYear()+pd(d.getMonth()+1)+pd(d.getDate())+"00071"+String(Date.now()).slice(-4),
    name:nm,price:price,ratio:ratio,attacher:$("#attacher").value.trim(),
    fuel:$("#aType").value.indexOf("电")>=0?"新能源":"燃油",
    certModel:$("#aCertModel").value.trim(),
    certNo:$("#aCertNo").value.trim(),vin:$("#aVin").value.trim(),engineNo:$("#aEngine").value.trim()
  };
  Object.keys(AMAP).forEach(function(k){var el=document.getElementById(AMAP[k]);rec[k]=el?String(el.value).trim():"";});
  var wasEditAsset=(editingAssetIdx!==null&&!!assets[editingAssetIdx]);
  if(wasEditAsset){rec.code=assets[editingAssetIdx].code;assets.splice(editingAssetIdx,1,rec);}
  else assets.push(rec);
  renderAssets();
  var hasCert=$("#aCertNo").value||attsOf("合格证").length;
  var hasInv=$("#aInvNo").value||attsOf("发票").length;
  var hasIns=$("#aPolicyNo").value||attsOf("保单").length;
  $("#checkStrip").innerHTML="[信息完整性提醒]：<span>合格证信息<b class='"+(hasCert?"good":"bad")+"'>"+(hasCert?"✓":"✗")+"</b></span><span>发票信息<b class='"+(hasInv?"good":"bad")+"'>"+(hasInv?"✓":"✗")+"</b></span><span>保单信息<b class='"+(hasIns?"good":"bad")+"'>"+(hasIns?"✓":"✗")+"</b></span><span>信息一致性<b class='"+(hasCert&&hasInv&&hasIns?"good":"bad")+"'>"+(hasCert&&hasInv&&hasIns?"✓":"✗")+"</b></span>";
  closeMask("assetMask");
  toast(wasEditAsset?"资产已更新":"资产已添加");
  editingAssetIdx=null;
});

/* ================= 保存 ================= */
function nowStr(){var d=new Date();function p(n){return (n<10?"0":"")+n;}return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+" "+p(d.getHours())+":"+p(d.getMinutes())+":"+p(d.getSeconds());}
function genOrderNo(){var d=new Date();function p(n){return (n<10?"0":"")+n;}return ""+d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+"00071"+String(Date.now()).slice(-4);}
function maskId(id){return id&&id.length>10?id.substr(0,6)+"********"+id.substr(-4):id||"--";}
function okModal(title,kv){
  $("#okTitle").textContent=title;
  $("#okBody").innerHTML=kv.map(function(x){return "<div>"+esc(x[0])+"：<b>"+esc(x[1])+"</b></div>";}).join("");
  openMask("okMask");
}

$("#savePersonBtn").addEventListener("click",function(){
  var name=$("#pIdName").textContent;
  if(name==="待识别"||!name){toast("缺少客户姓名（请解析或上传身份证）");return;}
  DB.persons.unshift({name:name,id:maskId($("#pIdNo").textContent==="待识别"?"":$("#pIdNo").textContent),src:"AI录单",marriage:getGroup("pMarriage")||"--",biz:"工厂担保业务",time:nowStr(),st:"待授权"});
  saveDB();renderPersons();closeMask("personMask");
  var kv=[["客户姓名",name],["身份证",maskId($("#pIdNo").textContent)],["婚姻状况",getGroup("pMarriage")||"--"],["手机号",$("#pPhone").value||"--"],["预贷款金额",$("#pPreLoan").value?$("#pPreLoan").value+" 万":"--"]];
  if(getGroup("pMarriage")==="已婚")kv.push(["配偶",($("#sIdName").textContent==="待识别"?"--":$("#sIdName").textContent)+"（证件已录入）"]);
  okModal("个人客户已保存",kv);
});
function saveCorp(withG){
  var name=$("#cCorpName").textContent;
  if(name==="待识别"||!name){toast("缺少公司名称（请解析或上传营业执照）");return;}
  DB.corps.unshift({name:name,code:$("#cCreditCode").textContent==="待识别"?"--":$("#cCreditCode").textContent,legal:$("#cLegalName").textContent==="待识别"?"--":$("#cLegalName").textContent,biz:"工厂担保业务",legalId:maskId($("#cLegalIdNo").textContent),st:"待授权"});
  saveDB();renderCorps();closeMask("corpMask");
  okModal("法人客户已保存"+(withG?"，法人已同步录为担保方":""),[["公司名称",name],["统一社会信用代码",$("#cCreditCode").textContent],["法人",$("#cLegalName").textContent],["法人手机号",$("#cPhone").value||"--"],["预贷款金额",$("#cPreLoan").value?$("#cPreLoan").value+" 万":"--"]]);
}
$("#saveCorpBtn").addEventListener("click",function(){
  var asG=document.getElementById("saveCorpAsG");
  saveCorp(!!(asG&&asG.checked));
});

/* ================= 订单编辑 ================= */
var editingOrderNo=null;
function snapshotForm(){
  return {
    bizType:getGroup("bizType"),prodType:getGroup("prodType"),calcType:getGroup("calcType"),repayType:getGroup("repayType"),
    product:$("#product").value,rate:$("#rate").value,term:$("#term").value,isDiscount:getGroup("isDiscount"),account:$("#account").value,
    custName:$("#custName").value,isBuyer:getGroup("isBuyer"),attachType:getGroup("attachType"),sameAttacher:getGroup("sameAttacher"),
    attacher:$("#attacher").value,city:$("#city").value,
    assets:JSON.parse(JSON.stringify(assets)),
    guarantor:(lastParse&&lastParse.fields&&fv(lastParse.fields,"guarantor.name"))?{name:fv(lastParse.fields,"guarantor.name"),phone:fv(lastParse.fields,"guarantor.phone"),idNo:fv(lastParse.fields,"guarantor.idNo")}:null
  };
}
function fillWizardFromOrder(o){
  editingOrderNo=o.no;
  resetWizard();
  editingOrderNo=o.no;
  var f=o.form||{};
  if(f.bizType)setGroup("bizType",f.bizType);
  if(f.prodType)setGroup("prodType",f.prodType);
  if(f.calcType)setGroup("calcType",f.calcType);
  if(f.repayType)setGroup("repayType",f.repayType);
  if(f.product){$("#product").value=f.product;setHidden($("#prodTags"),false);}
  if(f.rate)$("#rate").value=f.rate;
  if(f.term)$("#term").value=f.term;
  if(f.isDiscount)setGroup("isDiscount",f.isDiscount);
  if(f.account){$("#account").value=f.account;$("#account").dispatchEvent(new Event("change"));}
  $("#custName").value=f.custName||o.cust||"";
  if(f.isBuyer)setGroup("isBuyer",f.isBuyer);
  if(f.attachType)setGroup("attachType",f.attachType);
  if(f.sameAttacher)setGroup("sameAttacher",f.sameAttacher);
  $("#attacher").value=f.attacher||(o.attacher!=="--"?o.attacher:"")||"";
  if(f.city)$("#city").value=f.city;
  if(f.assets&&f.assets.length){assets=f.assets;renderAssets();}
  if(f.guarantor){
    var g=f.guarantor;
    var html=gCardHtml(g.name,g.phone,g.idNo);
    $("#guarantorList").innerHTML=html;
    $("#counterGList").innerHTML=html;
  }
  show("wizard");
  toast("已载入订单 "+o.no+"，可修改后保存");
}
document.getElementById("orderTable").addEventListener("click",function(e){
  var b=e.target.closest("[data-editorder]");
  if(!b)return;
  var o=DB.orders.filter(function(x){return x.no===b.dataset.editorder;})[0];
  if(!o){toast("未找到订单");return;}
  fillWizardFromOrder(o);
});
function submitOrder(){
  var miss=[];
  if(!$("#custName").value.trim())miss.push("客户名称");
  if(!getGroup("bizType"))miss.push("业务类型");
  if(!$("#product").value)miss.push("金融产品");
  if(!$("#rate").value.trim())miss.push("产品利率");
  if(!$("#term").value)miss.push("贷款期数");
  if(miss.length){toast("缺少必填项："+miss.join("、"));return;}
  var loan=0;assets.forEach(function(a){loan+=Math.round(a.price*a.ratio/100);});
  var o={
    no:genOrderNo(),contract:"--",cust:$("#custName").value.trim(),
    amt:loan?loan.toLocaleString():"--",
    rate:$("#rate").value?$("#rate").value+"%":"--",
    term:$("#term").value?$("#term").value+"期":"--",
    attach:getGroup("attachType")||"--",attacher:$("#attacher").value.trim()||"--",
    prod:$("#product").value.length>24?$("#product").value.substring(0,24)+"…":$("#product").value,st:"已保存"
  };
  if(editingOrderNo){
    var old=DB.orders.filter(function(x){return x.no===editingOrderNo;})[0];
    if(old){o.no=editingOrderNo;o.contract=old.contract;o.st=old.st;
      var oi=DB.orders.indexOf(old);DB.orders.splice(oi,1,o);}
    else DB.orders.unshift(o);
  }else{
    DB.orders.unshift(o);
  }
  o.form=snapshotForm();
  saveDB();renderOrders();
  var wasEdit=!!editingOrderNo;editingOrderNo=null;
  okModal(wasEdit?"订单已更新（状态：已保存）":"订单已保存（状态：已保存）",[["订单号",o.no],["客户名称",o.cust],["金融产品",$("#product").value],["贷款金额",o.amt+" 元"],["利率 / 期限",o.rate+" / "+o.term],["资产",assets.length?assets.length+" 台":"未添加"],["附件",attachments.length?attachments.length+" 个":"无"]]);
  setTimeout(function(){closeMask("okMask");show("orderList");},1600);
}
$("#saveOrderBtn").addEventListener("click",submitOrder);

/* ================= 示例 ================= */
var DEMO="客户王学良，男，汉族，身份证410727197309131532，已婚，手机号13875719999，邮箱wangxl@qq.com，本人是实际购买人。\n想买2台充电牵引车（含电池），单车销售价格52.7万，首付两成，新能源普通产品。\n零售新车，回租，等额本息，按月还款，36期，产品利率5%，不贴息，走兴业银行收款账户。\n挂靠郑州智运互联物流科技有限公司，同一挂靠方。\n配偶刘翠花，身份证410727197510201548。\n担保人王蓬蓬，电话15069482555，身份证370481198704173859。";
$("#demoFillBtn").addEventListener("click",function(){$("#chatInput").value=DEMO;toast("已填入示例，点击「AI 智能解析」");});

renderAttChecklist();
updateSteps();
})();
