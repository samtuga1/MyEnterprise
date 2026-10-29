import test from 'node:test';
import assert from 'node:assert/strict';
import {createAPI,available,totals,STORAGE_KEY,warrantyEligible} from '../public/assets/js/api.js';
import {createSeed} from '../public/assets/js/seed.js';
import {reports} from '../public/assets/js/reports.js';
import * as customer from '../public/assets/js/customer.js';
import * as admin from '../public/assets/js/admin.js';
import {esc} from '../public/assets/js/ui.js';
const shipping={name:'Demo Person',address:'123 Demo Lane',city:'Chicago',region:'IL',postal:'60601'};
function setup(){const data=new Map();const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};const api=createAPI(storage,()=>new Date('2026-10-26T12:00:00Z'),{admin:true});return {api,storage,data};}
async function signed(){const ctx=setup();await ctx.api.login('demo@gmail.com','password1234');return ctx;}
async function placed(){const ctx=await signed();ctx.api.addToCart(1,2);ctx.id=ctx.api.checkout(shipping,'approved');return ctx;}
const invariants=s=>{for(const i of s.inventory){assert.ok(Number.isInteger(i.onHand));assert.ok(i.reserved>=0);assert.ok(i.onHand>=i.reserved);}for(const o of s.orders){assert.equal(o.total,o.items.reduce((sum,i)=>sum+i.price*i.quantity,0));const refunded=s.refunds.filter(r=>r.orderId===o.id).reduce((sum,r)=>sum+r.amount,0);assert.ok(refunded<=o.total);}};
test('fixtures have valid relations, prices, stock and money totals',async()=>{const s=createSeed();assert.equal(s.products.length,16);assert.equal(s.variants.length,22);invariants(s);for(const v of s.variants){assert.ok(s.products.some(p=>p.id===v.productId));assert.ok(Number.isInteger(v.price));}assert.equal(available(s,25),0);});
test('cart quantities and totals persist without floating money',async()=>{const {api,storage}=setup();api.addToCart(1,2);api.addToCart(9);assert.equal(totals(api.snapshot()).total,15400);api.updateCart(1,1);assert.equal(totals(api.snapshot()).total,9600);assert.deepEqual(createAPI(storage).snapshot().cart,api.snapshot().cart);api.updateCart(1,0);assert.equal(api.snapshot().cart.length,1);});
test('invalid, excessive and out-of-stock quantities leave cart intact',async()=>{const {api}=setup();for(const q of [-1,0,1.5,100,NaN])assert.throws(()=>api.addToCart(1,q));assert.throws(()=>api.addToCart(25));api.addToCart(1);const before=api.snapshot();assert.throws(()=>api.updateCart(1,99));assert.deepEqual(api.snapshot(),before);});
test('checkout requires customer, address and approved simulated payment',async()=>{const {api}=setup();api.addToCart(1);assert.throws(()=>api.checkout(shipping,'approved'),/Sign in/);await api.login('demo@gmail.com','password1234');const before=api.snapshot();assert.throws(()=>api.checkout({...shipping,address:' '},'approved'),/Address/);assert.throws(()=>api.checkout(shipping,'declined'),/declined/);assert.deepEqual(api.snapshot(),before);});
test('checkout reserves all items atomically and cannot duplicate an empty cart',async()=>{const {api,id}=await placed();const s=api.snapshot(),o=s.orders.find(x=>x.id===id);assert.equal(o.total,11600);assert.equal(s.cart.length,0);assert.equal(o.allocations.reduce((n,a)=>n+a.quantity,0),2);assert.equal(s.inventory.filter(i=>i.variantId===1).reduce((n,i)=>n+i.reserved,0),2);assert.throws(()=>api.checkout(shipping,'approved'),/empty/);invariants(s);});
test('failure on second checkout line rolls back first line reservations',async()=>{const {api}=await signed();api.addToCart(1);api.addToCart(3);await api.loginAdmin('demo@gmail.com','password1234');for(const i of api.snapshot().inventory.filter(i=>i.variantId===3))api.adjustInventory(3,i.warehouseId,0,'Test depletion');await api.login('demo@gmail.com','password1234');const before=api.snapshot();assert.throws(()=>api.checkout(shipping,'approved'),/Insufficient/);assert.deepEqual(api.snapshot(),before);});
test('cancel releases reservations, refunds once, and respects ownership',async()=>{const {api,id}=await placed();await api.login('jordan@example.com','StyleDemo!26');assert.throws(()=>api.cancel(id,'Wrong owner'),/another/);await api.login('demo@gmail.com','password1234');api.cancel(id,'Changed plans');const s=api.snapshot();assert.equal(s.orders.find(o=>o.id===id).status,'Cancelled');assert.equal(s.refunds.filter(r=>r.orderId===id).length,1);assert.equal(s.inventory.filter(i=>i.variantId===1).reduce((n,i)=>n+i.reserved,0),0);assert.throws(()=>api.cancel(id,'Again'));invariants(s);});
test('fulfillment ships once, decrements stock once, delivers, disallows cancellation',async()=>{const {api,id}=await placed();const initial=api.snapshot().inventory.filter(i=>i.variantId===1).reduce((n,i)=>n+i.onHand,0);await api.loginAdmin('demo@gmail.com','password1234');api.fulfill(id);assert.throws(()=>api.fulfill(id));api.ship(id,'DEMO-TEST');assert.throws(()=>api.ship(id,'DEMO-AGAIN'));const s=api.snapshot();assert.equal(s.inventory.filter(i=>i.variantId===1).reduce((n,i)=>n+i.onHand,0),initial-2);api.deliver(id);assert.throws(()=>api.deliver(id));await api.login('demo@gmail.com','password1234');assert.throws(()=>api.cancel(id,'Too late'));invariants(api.snapshot());});
test('unallocated sample order is allocated on preparation',async()=>{const {api}=setup();await api.loginAdmin('demo@gmail.com','password1234');api.fulfill(1045);assert.equal(api.snapshot().orders.find(o=>o.id===1045).allocations.reduce((n,a)=>n+a.quantity,0),2);invariants(api.snapshot());});
test('purchase receipt adds exact stock once and checks supplier minimum',async()=>{const {api}=setup();await api.loginAdmin('demo@gmail.com','password1234');const initial=available(api.snapshot(),1);api.receivePurchase(501);assert.equal(available(api.snapshot(),1),initial+8);assert.throws(()=>api.receivePurchase(501),/already/);assert.throws(()=>api.createPurchase({supplierId:2,variantId:1,warehouseId:1,quantity:2}),/does not offer/);assert.throws(()=>api.createPurchase({supplierId:1,variantId:1,warehouseId:1,quantity:1}));api.createPurchase({supplierId:1,variantId:1,warehouseId:2,quantity:3});invariants(api.snapshot());});
test('returns prevent wrong orders and cumulative excess; refund workflow is ordered and idempotent',async()=>{const {api}=await signed();assert.throws(()=>api.requestReturn(1043,'item-1-1',1,'Wrong owner'));assert.throws(()=>api.requestReturn(1044,'item-9-1',1,'Not delivered'));assert.throws(()=>api.requestReturn(1042,'item-3-1',1,'Duplicate'));await api.loginAdmin('demo@gmail.com','password1234');assert.throws(()=>api.reviewReturn(701,'Refunded'));api.reviewReturn(701,'Approved');api.reviewReturn(701,'Received');const beforeStock=api.snapshot().inventory;api.reviewReturn(701,'Refunded');assert.throws(()=>api.reviewReturn(701,'Refunded'));assert.equal(api.snapshot().refunds[0].amount,8900);assert.deepEqual(api.snapshot().inventory,beforeStock);invariants(api.snapshot());});
test('new delivered order supports partial return and rejects cumulative excess',async()=>{const {api,id}=await placed();await api.loginAdmin('demo@gmail.com','password1234');api.fulfill(id);api.ship(id,'DEMO');api.deliver(id);await api.login('demo@gmail.com','password1234');const item=api.snapshot().orders.find(o=>o.id===id).items[0];api.requestReturn(id,item.id,1,'Damaged');api.requestReturn(id,item.id,1,'Second unit damaged');assert.throws(()=>api.requestReturn(id,item.id,1,'Too many'));assert.throws(()=>api.claim(id,item.id,'Overlapping request'));});
test('warranty eligibility, duplicate protection and review transitions',async()=>{const {api}=await signed();assert.throws(()=>api.claim(1042,'item-3-1','Return is open'),/return/);await api.login('jordan@example.com','StyleDemo!26');api.claim(1043,'item-1-1','Split seam');assert.throws(()=>api.claim(1043,'item-1-1','Duplicate'),/already/);const id=api.snapshot().claims[0].id;await api.loginAdmin('demo@gmail.com','password1234');assert.throws(()=>api.reviewClaim(id,'Resolved'));api.reviewClaim(id,'Under review');api.reviewClaim(id,'Resolved');assert.throws(()=>api.reviewClaim(id,'Resolved'));assert.equal(warrantyEligible({placedAt:'2020-01-01',status:'Delivered'},{warrantyMonths:12}),false);});
test('admin guard and reserved floor are enforced within the simulation',async()=>{const {api}=await signed();assert.throws(()=>api.adjustInventory(9,1,99,'Test'),/admin/);await api.loginAdmin('demo@gmail.com','password1234');assert.throws(()=>api.adjustInventory(9,1,0,'Below reserved'));api.adjustInventory(9,1,20,'Count corrected');assert.equal(api.snapshot().inventory.find(i=>i.variantId===9&&i.warehouseId===1).onHand,20);});
test('product, category, variant and specification edits persist and enforce uniqueness',async()=>{const {api,storage}=setup();await api.loginAdmin('demo@gmail.com','password1234');api.saveCategory({name:'Knitwear'});assert.throws(()=>api.saveCategory({name:'knitwear'}));api.saveProduct({name:'Demo Sweater',brand:'Example',description:'A fictional sweater.',categoryId:7,active:true});const p=api.snapshot().products.at(-1);api.saveVariant({productId:p.id,sku:'KNIT-1',price:12900,configuration:'M / Regular fit',color:'White',warrantyMonths:24,coverage:'Defects'});const v=api.snapshot().variants.at(-1);assert.equal(available(api.snapshot(),v.id),0);assert.throws(()=>api.saveVariant({...v,id:'',sku:'KNIT-1'}));api.saveSpec(v.id,{name:'Length',value:'60',unit:'cm'});api.saveSpec(v.id,{index:0,name:'Length',value:'65',unit:'cm'});assert.equal(api.snapshot().variants.at(-1).specs[0].value,'65');assert.deepEqual(createAPI(storage).snapshot(),{...api.snapshot(),adminSession:null});api.removeSpec(v.id,0);assert.equal(api.snapshot().variants.at(-1).specs.length,0);});
test('archived products are rejected at checkout',async()=>{const {api}=await signed();api.addToCart(1);await api.loginAdmin('demo@gmail.com','password1234');const p=api.snapshot().products[0];api.saveProduct({...p,categoryId:1,active:false});await api.login('demo@gmail.com','password1234');assert.throws(()=>api.checkout(shipping,'approved'),/no longer available/);});
test('suppliers and offers support edits and purchase creation',async()=>{const {api}=setup();await api.loginAdmin('demo@gmail.com','password1234');api.saveSupplier({name:'Demo Supply',contact:'supply@example.com'});api.saveOffer({supplierId:4,variantId:1,cost:65000,leadDays:4,minimum:3});api.createPurchase({supplierId:4,variantId:1,quantity:3,warehouseId:1});assert.equal(api.snapshot().purchases[0].cost,65000);});
test('registration validates confirmation and keeps only a salted verifier',async()=>{const {api,storage}=setup();const data={name:'Demo Learner',email:'learner@example.com',password:'DO-NOT-STORE',confirmPassword:'DO-NOT-STORE'};await api.register(data);assert.equal(api.snapshot().session.role,'customer');assert.ok(!JSON.stringify(api.snapshot()).includes(data.password));await assert.rejects(()=>api.register({...data,email:'LEARNER@example.com'}),/already exists/);api.logout();const loaded=createAPI(storage);await assert.rejects(()=>loaded.login(data.email,'Incorrect!26'),/incorrect/);await loaded.login(data.email,data.password);assert.equal(loaded.snapshot().session.name,'Demo Learner');});
test('storage write failure does not change in-memory state',async()=>{const {storage}=setup();const api=createAPI({...storage,setItem(){throw Error('Quota exceeded');}});const before=api.snapshot();assert.throws(()=>api.addToCart(1),/not saved/);assert.deepEqual(api.snapshot(),before);});
test('bad saved data is reported and reset only replaces the application key',async()=>{const {storage,data}=setup();data.set(STORAGE_KEY,'bad json');data.set('unrelated','keep');const api=createAPI(storage);assert.match(api.warning(),/could not be loaded/);api.reset();assert.equal(api.warning(),'');assert.equal(data.get('unrelated'),'keep');assert.equal(api.snapshot().orders.length,5);});
test('all seven reports return fixture results and respond to refund changes',async()=>{const {api}=setup();let rs=reports(api.snapshot());assert.equal(rs.length,7);rs.forEach(r=>assert.ok(r.length));assert.equal(rs[4].find(o=>o.number==='ME-1045').unallocated,2);await api.loginAdmin('demo@gmail.com','password1234');api.reviewReturn(701,'Approved');api.reviewReturn(701,'Received');api.reviewReturn(701,'Refunded');rs=reports(api.snapshot());const sneakers=rs[5].find(r=>r.name==='Everyday Court Sneakers');assert.equal(sneakers.rate,'100.0%');assert.equal(sneakers.refunds,8900);assert.equal(reports(api.snapshot(),{start:'2020-01-01',end:'2020-12-31'})[0].length,0);});
test('all customer/admin render functions produce pages and escape user content',async()=>{const s=createSeed();s.session={role:'customer',customerId:1,name:'Alex'};const params=new URLSearchParams();for(const render of [()=>customer.home(s),()=>customer.catalog(s,params),()=>customer.product(s,1,params),()=>customer.cart(s),()=>customer.checkout(s),()=>customer.auth(s,true,params),()=>customer.orders(s),()=>customer.orderDetails(s,1042),()=>admin.dashboard(s),()=>admin.products(s,params),()=>admin.variants(s,1),()=>admin.categories(s),()=>admin.inventory(s,params),()=>admin.suppliers(s),()=>admin.purchases(s),()=>admin.adminOrders(s,params),()=>admin.returns(s),()=>admin.warranties(s)])assert.ok(render().length>100);for(let i=1;i<=7;i++)assert.ok(admin.reportPage(s,new URLSearchParams({report:i})).includes(`QUESTION ${i} OF 7`));assert.equal(esc('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;');s.products[0].name='<script>alert(1)</script>';assert.ok(!customer.home(s).includes('<script>'));});

test('fashion fixtures expose size, fabric and care with valid outfit suggestions',async()=>{const s=createSeed();assert.equal(s.catalogDomain,'fashion');assert.deepEqual(s.categories.map(c=>c.name),['Tops','Shoes','Bottoms','Outerwear','Bags & accessories','Dresses']);for(const v of s.variants){assert.ok(v.configuration);assert.ok(v.specs.some(x=>x.name==='Material'));assert.ok(v.specs.some(x=>x.name==='Care'));}for(const r of s.compatibility){assert.ok(s.variants.some(v=>v.id===r.source));assert.ok(s.variants.some(v=>v.id===r.target));}assert.match(customer.product(s,1,new URLSearchParams()),/Style it with/);});
test('older saved demos are preserved with a reset notice, not silently replaced',async()=>{const {storage,data}=setup();const old=createSeed();delete old.catalogDomain;old.products[0].name='Previously edited product';storage.setItem(STORAGE_KEY,JSON.stringify(old));const before=data.get(STORAGE_KEY),api=createAPI(storage);assert.equal(api.snapshot().products[0].name,'Previously edited product');assert.match(api.warning(),/maintenance page/);assert.equal(data.get(STORAGE_KEY),before);api.reset();assert.equal(api.snapshot().catalogDomain,'fashion');assert.equal(api.warning(),'');});

test('dedicated administration can mutate records without replacing the customer session or cart',async()=>{const {api,storage}=await signed();api.addToCart(1,2);const before=api.snapshot();const workspace=createAPI(storage,undefined,{admin:true});assert.throws(()=>workspace.saveCategory({name:'Blocked'}),/Sign in/);await workspace.loginAdmin('demo@gmail.com','password1234');workspace.saveCategory({name:'Activewear'});assert.deepEqual(workspace.snapshot().session,before.session);assert.deepEqual(workspace.snapshot().cart,before.cart);assert.equal(createAPI(storage).snapshot().categories.at(-1).name,'Activewear');assert.throws(()=>createAPI(storage).saveCategory({name:'Unauthorized'}),/administration/);});
test('storefront forms and dashboard omit environment controls and admin entry',async()=>{const s=createSeed(),params=new URLSearchParams();for(const register of [false,true]){const html=customer.auth(s,register,params);assert.doesNotMatch(html,/demo|simulat|admin-login|admin-entry/i);}const dashboard=admin.dashboard(s);assert.match(dashboard,/>Dashboard</);assert.doesNotMatch(dashboard,/hero|demo|simulat|Mock results/i);s.session={role:'customer',customerId:1,name:'Alex'};s.cart=[{variantId:1,quantity:1}];assert.doesNotMatch(customer.checkout(s),/Simulated|Demo payment|name="payment"|type="password"/);assert.match(customer.checkout(s),/Place order/);});

test('incorrect passwords and customer credentials cannot start an admin session',async()=>{const {api}=setup();const before=api.snapshot();await assert.rejects(()=>api.login('demo@gmail.com','Wrong!123'),/incorrect/);await assert.rejects(()=>api.loginAdmin('jordan@example.com','StyleDemo!26'),/incorrect/);await assert.rejects(()=>api.loginAdmin('demo@gmail.com','Wrong!123'),/incorrect/);assert.deepEqual(api.snapshot(),before);});
test('registration rejects weak and mismatched passwords without writing records',async()=>{const {api}=setup(),before=api.snapshot();await assert.rejects(()=>api.register({name:'Test',email:'new@example.com',password:'short',confirmPassword:'short'}),/8 and 128/);await assert.rejects(()=>api.register({name:'Test',email:'new@example.com',password:'ValidPass!26',confirmPassword:'OtherPass!26'}),/do not match/);assert.deepEqual(api.snapshot(),before);});
test('admin logout preserves customer session and prevents further administrative edits',async()=>{const {api,storage}=await signed();api.addToCart(1);await api.loginAdmin('demo@gmail.com','password1234');const customerSession=api.snapshot().session;assert.equal(createAPI(storage,undefined,{admin:true}).isAdminAuthenticated(),false);api.logoutAdmin();assert.deepEqual(api.snapshot().session,customerSession);assert.equal(api.snapshot().cart.length,1);assert.throws(()=>api.saveCategory({name:'Blocked'}),/Sign in/);assert.equal(createAPI(storage,undefined,{admin:true}).isAdminAuthenticated(),false);});
test('passwordless records migrate without resetting the catalog, accounts, cart or orders',async()=>{const {storage}=setup();const old=createSeed();delete old.authVersion;delete old.demoLoginVersion;old.customers.forEach(c=>delete c.credential);old.session={role:'admin',name:'Old role switch'};old.cart=[{variantId:1,quantity:1}];old.products[0].name='Preserved edit';storage.setItem(STORAGE_KEY,JSON.stringify(old));const api=createAPI(storage,undefined,{admin:true});assert.equal(api.snapshot().session,null);assert.equal(api.isAdminAuthenticated(),false);assert.deepEqual(api.snapshot().cart,old.cart);assert.deepEqual(api.snapshot().orders,old.orders);assert.equal(api.snapshot().products[0].name,'Preserved edit');await api.login('demo@gmail.com','password1234');assert.equal(createAPI(storage).snapshot().authVersion,1);});
test('customer and admin login render labeled masked password inputs',()=>{const s=createSeed(),params=new URLSearchParams();assert.match(customer.auth(s,false,params),/autocomplete="current-password"/);assert.match(customer.auth(s,true,params),/name="confirmPassword"/);assert.match(admin.login(params),/type="password"/);assert.doesNotMatch(admin.login(params),/class="hero"/);});

test('updated sample login migrates saved accounts while preserving records and custom passwords',async()=>{
  const {api,storage}=setup();
  await api.register({name:'Learner',email:'learner@example.com',password:'CustomPass!26',confirmPassword:'CustomPass!26'});
  api.addToCart(1,2);
  const old=api.snapshot();delete old.demoLoginVersion;
  old.customers[0].email='alex@example.com';
  old.customers[0].credential=structuredClone(old.customers[1].credential);
  old.products[0].name='Saved edit';
  storage.setItem(STORAGE_KEY,JSON.stringify(old));
  const loaded=createAPI(storage,undefined,{admin:true});
  assert.deepEqual(loaded.snapshot().cart,old.cart);
  assert.deepEqual(loaded.snapshot().orders,old.orders);
  assert.deepEqual(loaded.snapshot().customers.at(-1),old.customers.at(-1));
  assert.equal(loaded.snapshot().products[0].name,'Saved edit');
  await assert.rejects(()=>loaded.login('demo@gmail.com','StyleDemo!26'),/incorrect/);
  await loaded.login('demo@gmail.com','password1234');
  assert.equal(loaded.snapshot().session.customerId,1);
  assert.equal(loaded.isAdminAuthenticated(),false);
  await loaded.loginAdmin('demo@gmail.com','password1234');
  assert.equal(loaded.isAdminAuthenticated(),true);
  assert.equal(loaded.snapshot().session.customerId,1);
  await loaded.login('learner@example.com','CustomPass!26');
  assert.equal(createAPI(storage).snapshot().demoLoginVersion,1);
});

test('sample migration reuses an existing requested email without duplicating accounts',async()=>{
  const {storage}=setup();const old=createSeed();delete old.demoLoginVersion;
  old.customers[0].email='alex@example.com';
  old.customers.push({id:4,name:'Existing Demo',email:'demo@gmail.com',credential:structuredClone(old.customers[1].credential)});
  storage.setItem(STORAGE_KEY,JSON.stringify(old));
  const loaded=createAPI(storage);
  await loaded.login('demo@gmail.com','password1234');
  assert.equal(loaded.snapshot().session.customerId,4);
  assert.equal(loaded.snapshot().customers.length,4);
  assert.deepEqual(loaded.snapshot().orders,old.orders);
});


test('admin login is page-scoped and saved or legacy sessions cannot bypass sign-in',async()=>{
  const {api,storage}=await signed();api.addToCart(1);
  await api.loginAdmin('demo@gmail.com','password1234');
  api.saveCategory({name:'Page scoped edit'});
  assert.equal(api.isAdminAuthenticated(),true);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).adminSession,null);
  const saved=api.snapshot();
  // Simulate a snapshot persisted by the previous version.
  storage.setItem(STORAGE_KEY,JSON.stringify(saved));
  const reopened=createAPI(storage,undefined,{admin:true});
  assert.equal(reopened.isAdminAuthenticated(),false);
  assert.equal(reopened.snapshot().adminSession,null);
  assert.deepEqual(reopened.snapshot().session,saved.session);
  assert.deepEqual(reopened.snapshot().cart,saved.cart);
  assert.throws(()=>reopened.saveCategory({name:'Blocked'}),/Sign in/);
  await reopened.loginAdmin('demo@gmail.com','password1234');
  reopened.saveCategory({name:'After signing in again'});
  assert.equal(reopened.snapshot().categories.at(-1).name,'After signing in again');
});

test('cross-tab data refresh preserves only the current page admin login',async()=>{
  const {api,storage}=setup();const other=createAPI(storage,undefined,{admin:true});
  await api.loginAdmin('demo@gmail.com','password1234');
  api.saveCategory({name:'Shared data'});
  other.refresh();assert.equal(other.isAdminAuthenticated(),false);
  assert.equal(other.snapshot().categories.at(-1).name,'Shared data');
  await other.login('demo@gmail.com','password1234');other.addToCart(1);
  api.refresh();assert.equal(api.isAdminAuthenticated(),true);
  assert.equal(api.snapshot().cart.length,1);
  api.saveCategory({name:'Still signed in'});
  api.logoutAdmin();api.refresh();assert.equal(api.isAdminAuthenticated(),false);
});
