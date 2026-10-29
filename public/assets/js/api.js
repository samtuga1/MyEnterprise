import {createCredential,verifyPassword,validatePassword} from './auth.js?v=auth-20261029-3';
import {createSeed,CUSTOMER_CREDENTIAL,DEMO_CUSTOMER,ADMIN_ACCOUNT} from './seed.js?v=auth-20261029-3';
export const STORAGE_KEY='myenterprise.frontend.v1';
const copy=value=>structuredClone(value);
const fail=message=>{throw new Error(message);};
const integer=(value,min=0,max=1000000)=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<min||n>max)fail(`Enter a whole number between ${min} and ${max}.`);return n;};
const required=(value,label,max=255)=>{const s=String(value??'').trim();if(!s||s.length>max)fail(`${label} is required (maximum ${max} characters).`);return s;};
const email=value=>{const s=required(value,'Email',100).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))fail('Enter a valid email address.');return s;};
const next=rows=>Math.max(0,...rows.map(x=>x.id))+1;
export function available(state,variantId){return state.inventory.filter(i=>i.variantId===Number(variantId)).reduce((n,i)=>n+i.onHand-i.reserved,0);}
export function totals(state){const subtotal=state.cart.reduce((n,i)=>n+(state.variants.find(v=>v.id===i.variantId)?.price||0)*i.quantity,0);return {subtotal,shipping:0,tax:0,total:subtotal};}
export function warrantyEligible(order,variant,now=new Date()){const end=new Date(order.placedAt);end.setUTCMonth(end.getUTCMonth()+variant.warrantyMonths);return order.status==='Delivered'&&now<=end;}
export function createAPI(storage,now=()=>new Date(),options={}) {
  let state=createSeed();let storageError='';
  try{const raw=storage.getItem(STORAGE_KEY);if(raw){const saved=JSON.parse(raw);if(saved.version!==1||Object.keys(state).some(k=>Array.isArray(state[k])&&!Array.isArray(saved[k])))fail('Saved records are incompatible.');state=saved;}}catch{storageError='Saved records could not be loaded. Check browser storage or restore the sample data using the project maintenance page.';}
  // Upgrade passwordless local profiles without losing carts, orders, or catalog edits.
  if(state.authVersion!==1){state.customers=state.customers.map(c=>({...c,credential:copy(CUSTOMER_CREDENTIAL)}));state.session=null;state.adminSession=null;state.authVersion=1;delete state.demoLoginVersion;}
  // Apply the requested sample login once, preserving IDs and unrelated registered credentials.
  if(state.demoLoginVersion!==1){
    let account=state.customers.find(c=>c.email.toLowerCase()===DEMO_CUSTOMER.email);
    if(!account)account=state.customers.find(c=>c.id===1&&c.email==='alex@example.com');
    if(account){account.email=DEMO_CUSTOMER.email;account.credential=copy(DEMO_CUSTOMER.credential);}
    else state.customers.push({id:next(state.customers),name:'Alex Morgan',email:DEMO_CUSTOMER.email,credential:copy(DEMO_CUSTOMER.credential)});
    state.demoLoginVersion=1;
  }
  // Administration is page-scoped: never trust or restore a saved admin session.
  state.adminSession=null;
  let adminSession=null;
  const adminSignedIn=()=>adminSession?.role==='admin'&&adminSession?.authVersion===1;
  const get=(rows,id)=>rows.find(x=>x.id===Number(id))||fail('That record no longer exists.');
  const admin=s=>{if(!options.admin||!adminSignedIn(s))fail('Sign in to administration to use this action.');};
  const customer=s=>{if(s.session?.role!=='customer')fail('Sign in to your account first.');return s.session.customerId;};
  const own=(s,id)=>{const o=get(s.orders,id);if(o.customerId!==customer(s))fail('This order belongs to another customer.');return o;};
  const mutate=fn=>{const draft=copy(state);const result=fn(draft);try{storage.setItem(STORAGE_KEY,JSON.stringify(draft));}catch{fail('Changes were not saved. Browser storage is unavailable or full. Enable storage and try again.');}state=draft;storageError='';return copy(result??null);};
  const stock=(s,v,w)=>s.inventory.find(x=>x.variantId===v&&x.warehouseId===w)||fail('Inventory record not found.');
  const reserve=(s,o)=>{if(o.allocations.length)fail('This order is already allocated.');for(const item of o.items){if(available(s,item.variantId)<item.quantity)fail('Insufficient available stock. No changes were saved.');let remaining=item.quantity;for(const row of s.inventory.filter(x=>x.variantId===item.variantId)){const q=Math.min(remaining,row.onHand-row.reserved);if(q){row.reserved+=q;o.allocations.push({variantId:item.variantId,warehouseId:row.warehouseId,quantity:q});remaining-=q;}}}};
  const movement=(s,v,w,q,reason)=>s.movements.unshift({id:next(s.movements),variantId:v,warehouseId:w,quantity:q,reason,date:now().toISOString()});
  return {
    snapshot:()=>({...copy(state),adminSession:copy(adminSession)}), isAdminAuthenticated:()=>adminSignedIn(),
    refresh:()=>{const loaded=createAPI(storage,now,options);state=loaded.snapshot();storageError=loaded.warning();}, warning:()=>storageError||(state.catalogDomain!=='fashion'?'An earlier collection is saved. Restore the fashion collection using the project maintenance page.':''),
    reset:()=>{const fresh=createSeed();try{storage.setItem(STORAGE_KEY,JSON.stringify(fresh));}catch{fail('Cannot restore records: browser storage is unavailable.');}state=fresh;adminSession=null;storageError='';},
    login:async(address,password)=>{
      const c=state.customers.find(c=>c.email===email(address));
      if(!c||!await verifyPassword(password,c.credential))fail('Email or password is incorrect.');
      return mutate(s=>{const current=get(s.customers,c.id);if(current.credential.hash!==c.credential.hash)fail('Please sign in again.');s.session={role:'customer',customerId:c.id,name:c.name,authVersion:1};});
    },
    loginAdmin:async(address,password)=>{
      if(!options.admin)fail('Open administration to sign in.');
      if(email(address)!==ADMIN_ACCOUNT.email||!await verifyPassword(password,ADMIN_ACCOUNT.credential))fail('Email or password is incorrect.');
      adminSession={role:'admin',name:ADMIN_ACCOUNT.name,authVersion:1};
    },
    register:async data=>{
      const address=email(data.email),name=required(data.name,'Name',100);
      validatePassword(data.password);
      if(data.password!==data.confirmPassword)fail('Passwords do not match.');
      const credential=await createCredential(data.password);
      return mutate(s=>{if(s.customers.some(c=>c.email===address))fail('An account with this email already exists. Sign in instead.');const c={id:next(s.customers),name,email:address,credential};s.customers.push(c);s.session={role:'customer',customerId:c.id,name:c.name,authVersion:1};});
    },
    logout:()=>mutate(s=>{s.session=null;s.cart=[];}),
    logoutAdmin:()=>{adminSession=null;},
    addToCart:(id,quantity=1)=>mutate(s=>{const v=get(s.variants,id),p=get(s.products,v.productId);if(!p.active)fail('This product is no longer available.');const q=integer(quantity,1,99),existing=s.cart.find(i=>i.variantId===v.id),total=q+(existing?.quantity||0);if(total>99||total>available(s,v.id))fail('There is not enough available stock for that quantity.');if(existing)existing.quantity=total;else s.cart.push({variantId:v.id,quantity:q});}),
    updateCart:(id,quantity)=>mutate(s=>{const q=integer(quantity,0,99),v=get(s.variants,id);if(q>available(s,v.id))fail('That quantity exceeds available stock.');if(q===0)s.cart=s.cart.filter(i=>i.variantId!==v.id);else {const item=s.cart.find(i=>i.variantId===v.id)||fail('Cart item not found.');item.quantity=q;}}),
    checkout:(shipping,payment)=>mutate(s=>{const customerId=customer(s);if(!s.cart.length)fail('Your cart is empty.');const address={};for(const [key,label] of Object.entries({name:'Full name',address:'Address',city:'City',region:'State / region',postal:'Postal code'}))address[key]=required(shipping[key],label,150);if(payment==='declined')fail('Payment declined. Your cart and inventory have not changed.');if(payment!=='approved')fail('Choose a valid payment option.');const items=s.cart.map((i,index)=>{const v=get(s.variants,i.variantId),p=get(s.products,v.productId);if(!p.active)fail('A product in your cart is no longer available.');integer(i.quantity,1,99);return {...i,id:`item-${next(s.orders)}-${index}`,price:v.price,name:p.name,configuration:v.configuration,color:v.color};});const id=next(s.orders);const o={id,number:`ME-${id}`,customerId,status:'Paid',placedAt:now().toISOString(),items,total:totals(s).total,shipping:address,payment:'Paid',allocations:[],tracking:'',cancelReason:''};reserve(s,o);s.orders.unshift(o);s.cart=[];return o.id;}),
    cancel:(id,reason)=>mutate(s=>{const o=own(s,id);if(!['Paid','Processing'].includes(o.status))fail('Only unshipped orders can be cancelled.');o.cancelReason=required(reason,'Cancellation reason');for(const a of o.allocations)stock(s,a.variantId,a.warehouseId).reserved-=a.quantity;o.allocations=[];o.status='Cancelled';o.payment='Refunded';s.refunds.unshift({id:next(s.refunds),orderId:o.id,amount:o.total,type:'Cancellation',status:'Completed',date:now().toISOString()});}),
    requestReturn:(orderId,itemId,quantity,reason)=>mutate(s=>{const o=own(s,orderId);if(o.status!=='Delivered')fail('Returns are available after delivery.');const item=o.items.find(i=>i.id===itemId)||fail('Order item not found.');const past=s.returns.filter(r=>r.orderId===o.id&&r.itemId===itemId&&r.status!=='Rejected').reduce((sum,r)=>sum+r.quantity,0);const q=integer(quantity,1,item.quantity);if(q+past>item.quantity)fail('The requested quantity has already been returned or requested.');s.returns.unshift({id:next(s.returns),orderId:o.id,itemId,quantity:q,reason:required(reason,'Return reason'),status:'Requested',amount:item.price*q});}),
    claim:(orderId,itemId,reason)=>mutate(s=>{const o=own(s,orderId),item=o.items.find(i=>i.id===itemId)||fail('Order item not found.'),v=get(s.variants,item.variantId);if(!warrantyEligible(o,v,now()))fail('This purchase is not currently eligible for a warranty claim.');if(s.claims.some(c=>c.orderId===o.id&&c.itemId===itemId&&!['Resolved','Rejected'].includes(c.status)))fail('An open warranty claim already exists for this item.');if(s.returns.some(r=>r.orderId===o.id&&r.itemId===itemId&&r.status!=='Rejected'))fail('A return is already in progress for this item.');s.claims.unshift({id:next(s.claims),orderId:o.id,itemId,reason:required(reason,'Claim reason'),status:'Submitted',createdAt:now().toISOString()});}),
    saveProduct:data=>mutate(s=>{admin(s);const categoryId=integer(data.categoryId,1);get(s.categories,categoryId);const fields={name:required(data.name,'Product name',100),brand:required(data.brand,'Brand',80),description:required(data.description,'Description',2000),categoryIds:[categoryId],active:data.active===true};if(data.id)Object.assign(get(s.products,data.id),fields);else s.products.push({id:next(s.products),...fields,image:'fallback',featured:false});}),
    saveCategory:data=>mutate(s=>{admin(s);const name=required(data.name,'Category',80);if(s.categories.some(c=>c.name.toLowerCase()===name.toLowerCase()&&c.id!==Number(data.id)))fail('A category with that name already exists.');if(data.id)get(s.categories,data.id).name=name;else s.categories.push({id:next(s.categories),name});}),
    saveVariant:data=>mutate(s=>{admin(s);get(s.products,data.productId);const price=integer(data.price,1,99999999),sku=required(data.sku,'SKU',80);if(s.variants.some(v=>v.sku.toLowerCase()===sku.toLowerCase()&&v.id!==Number(data.id)))fail('SKU must be unique.');const fields={productId:Number(data.productId),sku,configuration:required(data.configuration,'Size / fit',150),color:required(data.color,'Color',50),price,warrantyMonths:integer(data.warrantyMonths,1,120),coverage:required(data.coverage,'Warranty coverage',1000)};if(data.id)Object.assign(get(s.variants,data.id),fields);else {const v={id:next(s.variants),...fields,specs:[]};s.variants.push(v);s.warehouses.forEach(w=>s.inventory.push({variantId:v.id,warehouseId:w.id,onHand:0,reserved:0}));}}),
    saveSpec:(variantId,data)=>mutate(s=>{admin(s);const v=get(s.variants,variantId),spec={name:required(data.name,'Specification name',80),value:required(data.value,'Value',150),unit:String(data.unit||'').trim().slice(0,30)};if(data.index!==undefined&&data.index!=='')v.specs[integer(data.index,0,v.specs.length-1)]=spec;else v.specs.push(spec);}),
    removeSpec:(variantId,index)=>mutate(s=>{admin(s);const v=get(s.variants,variantId);v.specs.splice(integer(index,0,v.specs.length-1),1);}),
    adjustInventory:(v,w,onHand,reason)=>mutate(s=>{admin(s);const row=stock(s,Number(v),Number(w)),q=integer(onHand,row.reserved);movement(s,row.variantId,row.warehouseId,q-row.onHand,required(reason,'Adjustment reason'));row.onHand=q;}),
    saveSupplier:data=>mutate(s=>{admin(s);const fields={name:required(data.name,'Supplier name',100),contact:required(data.contact,'Contact',100)};if(data.id)Object.assign(get(s.suppliers,data.id),fields);else s.suppliers.push({id:next(s.suppliers),...fields});}),
    saveOffer:data=>mutate(s=>{admin(s);const supplierId=Number(data.supplierId),variantId=Number(data.variantId);get(s.suppliers,supplierId);get(s.variants,variantId);const fields={supplierId,variantId,cost:integer(data.cost,1,99999999),leadDays:integer(data.leadDays,1,365),minimum:integer(data.minimum,1,999)};const existing=s.offers.find(o=>o.supplierId===supplierId&&o.variantId===variantId);if(existing)Object.assign(existing,fields);else s.offers.push(fields);}),
    createPurchase:data=>mutate(s=>{admin(s);const supplierId=Number(data.supplierId),variantId=Number(data.variantId),warehouseId=Number(data.warehouseId);get(s.warehouses,warehouseId);const offer=s.offers.find(o=>o.supplierId===supplierId&&o.variantId===variantId)||fail('This supplier does not offer that variant. Add a supplier offer first.');const quantity=integer(data.quantity,offer.minimum,999);s.purchases.unshift({id:next(s.purchases),supplierId,variantId,warehouseId,quantity,cost:offer.cost,status:'Ordered',orderedAt:now().toISOString()});}),
    receivePurchase:id=>mutate(s=>{admin(s);const p=get(s.purchases,id);if(p.status!=='Ordered')fail('This purchase order has already been received.');stock(s,p.variantId,p.warehouseId).onHand+=p.quantity;movement(s,p.variantId,p.warehouseId,p.quantity,`Receipt PO-${p.id}`);p.status='Received';}),
    fulfill:id=>mutate(s=>{admin(s);const o=get(s.orders,id);if(o.status!=='Paid')fail('Only paid orders can enter fulfillment.');if(!o.allocations.length)reserve(s,o);o.status='Processing';}),
    ship:(id,tracking)=>mutate(s=>{admin(s);const o=get(s.orders,id);if(o.status!=='Processing')fail('Allocate and prepare this order before shipping.');o.tracking=required(tracking,'Tracking number',100);for(const a of o.allocations){const row=stock(s,a.variantId,a.warehouseId);row.onHand-=a.quantity;row.reserved-=a.quantity;movement(s,a.variantId,a.warehouseId,-a.quantity,`Shipment ${o.number}`);}o.status='Shipped';}),
    deliver:id=>mutate(s=>{admin(s);const o=get(s.orders,id);if(o.status!=='Shipped')fail('Only shipped orders can be marked delivered.');o.status='Delivered';}),
    reviewReturn:(id,action)=>mutate(s=>{admin(s);const r=get(s.returns,id);const allowed={Requested:['Approved','Rejected'],Approved:['Received'],Received:['Refunded']};if(!allowed[r.status]?.includes(action))fail('This return cannot make that status transition.');if(action==='Refunded'){const o=get(s.orders,r.orderId),paidBack=s.refunds.filter(x=>x.orderId===o.id).reduce((n,x)=>n+x.amount,0);if(paidBack+r.amount>o.total)fail('Refund exceeds paid amount.');s.refunds.unshift({id:next(s.refunds),returnId:r.id,orderId:o.id,amount:r.amount,type:'Return',status:'Completed',date:now().toISOString()});}r.status=action;}),
    reviewClaim:(id,status)=>mutate(s=>{admin(s);const c=get(s.claims,id),allowed={Submitted:['Under review','Rejected'],'Under review':['Resolved','Rejected']};if(!allowed[c.status]?.includes(status))fail('This warranty claim cannot make that status transition.');c.status=status;})
  };
}
