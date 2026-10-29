// Public fictional account fixtures; see README for sample passwords. Never use as real credentials.
export const CUSTOMER_CREDENTIAL = {"salt": "0712314261728191a1b1c1d1e1f10213", "hash": "78dc5a171cf7d06d200ccab2240861b091f215ba943567195a0161cc0cde2715", "iterations": 100000};
export const DEMO_CUSTOMER = {"email": "demo@gmail.com", "credential": {"salt": "0712314261728191a1b1c1d1e1f10213", "hash": "99652425b712b3e374255ff509fb79a9fd0cb78e78e9a2c73f6690f4f52dd1e7", "iterations": 100000}};
export const ADMIN_ACCOUNT = {"email": "demo@gmail.com", "name": "Store administrator", "credential": {"salt": "192837465564738291aabbccddeeff00", "hash": "56e98a3ceb140b8b32c54e18f7919f730e2c02a60ab02c0578284cbdcddff5f9", "iterations": 100000}};
// Browser-only fixture data. Prices are integer cents; these are not database records.
export function createSeed() {
  const categories = ['Tops', 'Shoes', 'Bottoms', 'Outerwear', 'Bags & accessories', 'Dresses'].map((name, i) => ({id: i + 1, name}));
  // Fictional fashion labels. Sizes use the existing configuration field, not new database columns.
  // name, label, category, cents, artwork, description, size/fit, color, coverage months, material, care, alternate size
  const source = [
    ['Relaxed Linen Shirt', 'Field & Form', 1, 5800, 'shirt', 'An airy button-up with an easy drape and a softly curved hem.', 'M / Relaxed fit', 'Sage', 6, '55% linen / 45% cotton', 'Cold gentle wash; line dry', 'L / Relaxed fit'],
    ['Everyday Court Sneakers', 'Stride Studio', 2, 8900, 'sneakers', 'Clean low-top sneakers with a padded collar and flexible sole.', 'EU 39 / Regular width', 'Chalk', 12, 'Cotton canvas upper / rubber sole', 'Spot clean; air dry', 'EU 40 / Regular width'],
    ['Straight-Leg Denim', 'Common Thread', 3, 7200, 'jeans', 'Classic five-pocket denim with a straight leg and a comfortable rise.', 'W28 / L30', 'Indigo', 6, '99% cotton / 1% elastane', 'Wash inside out at 30°C; line dry', 'W30 / L30'],
    ['Everyday Trench Coat', 'Field & Form', 4, 14800, 'coat', 'A lightweight belted layer for changing skies and everyday plans.', 'M / Relaxed fit', 'Sand', 12, '100% cotton shell / polyester lining', 'Professional dry clean', 'L / Relaxed fit'],
    ['Canvas Carryall Tote', 'Sunday Goods', 5, 3800, 'tote', 'A roomy cotton tote with an inner pocket for the little essentials.', 'One size / 38 × 40 cm', 'Natural', 6, '100% cotton canvas', 'Spot clean; air dry', 'One size / 38 × 40 cm'],
    ['Gathered Midi Dress', 'Willow Lane', 6, 9600, 'dress', 'A softly gathered waist and flowing skirt, made for slow weekends.', 'M / Regular fit', 'Terracotta', 6, '100% cotton', 'Cold gentle wash; line dry', 'L / Regular fit'],
    ['Everyday Cotton Tee', 'Common Thread', 1, 2400, 'tee', 'A soft crew neck with a clean silhouette for everyday layering.', 'M / Regular fit', 'Ivory', 6, '100% cotton', 'Machine wash at 30°C', ''],
    ['Suede Penny Loafers', 'Stride Studio', 2, 11000, 'loafers', 'Easy slip-ons with a soft footbed and a timeless penny strap.', 'EU 40 / Regular width', 'Cocoa', 12, 'Suede leather upper / rubber sole', 'Brush with a suede brush; keep dry', ''],
    ['Pleated Wide-Leg Trousers', 'Field & Form', 3, 7800, 'trousers', 'Fluid pleats and a wide leg take you from mornings to evenings.', 'M / Regular waist', 'Olive', 6, '65% polyester / 33% viscose / 2% elastane', 'Cold gentle wash; hang dry', ''],
    ['Quilted Weekend Jacket', 'Sunday Goods', 4, 12400, 'jacket', 'A light quilted layer with generous patch pockets.', 'M / Relaxed fit', 'Forest', 12, '100% polyester shell and fill', 'Cold gentle wash; dry flat', ''],
    ['Everyday Crossbody Bag', 'Willow Lane', 5, 6400, 'bag', 'A compact zip-top bag with an adjustable strap for hands-free days.', 'One size / 22 × 16 cm', 'Cognac', 6, 'Polyurethane outer / cotton lining', 'Wipe clean with a damp cloth', ''],
    ['Ribbed Knit Scarf', 'Common Thread', 5, 3200, 'scarf', 'A soft rib knit adds a little warmth to your daily layers.', 'One size / 180 × 30 cm', 'Oat', 6, '80% cotton / 20% wool', 'Cold hand wash; dry flat', ''],
    ['Wrap Midi Dress', 'Willow Lane', 6, 8800, 'wrapdress', 'An adjustable tie waist with a graceful midi-length hem.', 'M / Adjustable waist', 'Forest', 6, '100% viscose', 'Cold hand wash; line dry', ''],
    ['Soft Knit Cardigan', 'Sunday Goods', 1, 6800, 'cardigan', 'A textured button-front knit for cool mornings and cozy evenings.', 'M / Relaxed fit', 'Oat', 6, '100% cotton knit', 'Cold gentle wash; dry flat', ''],
    ['Weekend Walking Sneakers', 'Stride Studio', 2, 9500, 'trainers', 'Breathable mesh and a cushioned sole for days on the move.', 'EU 40 / Regular width', 'Sage', 12, 'Polyester mesh upper / EVA and rubber sole', 'Spot clean; air dry', ''],
    ['Sleeveless Poplin Dress', 'Field & Form', 6, 8400, 'poplindress', 'Crisp cotton poplin with an easy skirt and side pockets.', 'M / Regular fit', 'Slate Blue', 6, '100% cotton poplin', 'Machine wash at 30°C; line dry', '']
  ];
  const products = source.map((s, i) => ({id:i+1, name:s[0], brand:s[1], categoryIds:[s[2]], description:s[5] + ' Check the size, fabric, and care details to find your everyday fit.', image:s[4], active:true, featured:i<4}));
  const variants = source.flatMap((s,i) => [0,...(i<6?[1]:[])].map(alternate=>({
    id:i*2+1+alternate, productId:i+1, sku:`ME-${String(i+1).padStart(3,'0')}-${alternate?'B':'A'}`,
    configuration:alternate?s[11]:s[6], color:alternate&&i===4?'Forest':s[7], price:s[3],
    specs:[{name:'Material',value:s[9],unit:''},{name:'Care',value:s[10],unit:''},{name:'Size system',value:s[2]===2?'EU shoe sizes':s[2]===3?'Waist / inseam in inches, or letter size':s[2]===5?'Dimensions in centimeters':'Letter sizes; see selected fit',unit:''}],
    warrantyMonths:s[8], coverage:'Quality warranty for manufacturing defects in seams, stitching, or fastenings. Normal wear, incorrect care, accidental damage, and fit preferences are excluded. Use a return request for fit issues.'
  })));
  const warehouses=[{id:1,name:'Chicago Central',location:'Chicago, IL'},{id:2,name:'Austin South',location:'Austin, TX'}];
  const inventory=variants.flatMap(v=>warehouses.map(w=>({variantId:v.id,warehouseId:w.id,onHand:v.id===25?0:((v.id*7+w.id*3)%29)+2,reserved:0})));
  const customers=[{id:1,name:'Alex Morgan',email:DEMO_CUSTOMER.email},{id:2,name:'Jordan Lee',email:'jordan@example.com'},{id:3,name:'Sam Rivera',email:'sam@example.com'}].map(c=>({...c,credential:structuredClone(c.id===1?DEMO_CUSTOMER.credential:CUSTOMER_CREDENTIAL)}));
  const items=(v,q=1)=>{const variant=variants.find(x=>x.id===v);return [{id:`item-${v}-${q}`,variantId:v,quantity:q,price:variant.price,name:products.find(p=>p.id===variant.productId).name,configuration:variant.configuration,color:variant.color}];};
  const orders=[
    {id:1042,customerId:1,status:'Delivered',placedAt:'2026-10-12T12:00:00Z',items:items(3),allocations:[{variantId:3,warehouseId:1,quantity:1}],tracking:'ME-SHP-1042',payment:'Paid'},
    {id:1043,customerId:2,status:'Delivered',placedAt:'2026-10-18T12:00:00Z',items:items(1),allocations:[{variantId:1,warehouseId:1,quantity:1}],tracking:'ME-SHP-1043',payment:'Paid'},
    {id:1044,customerId:1,status:'Processing',placedAt:'2026-10-24T12:00:00Z',items:items(9),allocations:[{variantId:9,warehouseId:1,quantity:1}],tracking:'',payment:'Paid'},
    {id:1045,customerId:3,status:'Paid',placedAt:'2026-10-25T12:00:00Z',items:items(11,2),allocations:[],tracking:'',payment:'Paid'},
    {id:1046,customerId:2,status:'Delivered',placedAt:'2026-09-18T12:00:00Z',items:items(7),allocations:[{variantId:7,warehouseId:1,quantity:1}],tracking:'ME-SHP-1046',payment:'Paid'}
  ].map(o=>({...o,number:`ME-${o.id}`,total:o.items.reduce((s,i)=>s+i.price*i.quantity,0),shipping:{name:customers.find(c=>c.id===o.customerId).name,address:'123 Willow Lane',city:'Chicago',region:'IL',postal:'60601'},cancelReason:''}));
  inventory.find(i=>i.variantId===9&&i.warehouseId===1).reserved=1;
  const suppliers=[{id:1,name:'Northstar Distribution',contact:'orders@northstar.example'},{id:2,name:'Threadline Apparel Supply',contact:'hello@threadline.example'},{id:3,name:'Stride Footwear Wholesale',contact:'sales@stride.example'}];
  const offers=variants.map((v,i)=>({supplierId:source[v.productId-1][2]===2?3:[5,6].includes(source[v.productId-1][2])?2:1,variantId:v.id,cost:Math.round(v.price*.68),leadDays:3+i%8,minimum:2}));
  return {version:1,authVersion:1,demoLoginVersion:1,catalogDomain:'fashion',session:null,adminSession:null,categories,products,variants,warehouses,inventory,customers,orders,suppliers,offers,cart:[],
    compatibility:[{source:1,target:5,type:'Style with straight-leg denim'},{source:1,target:3,type:'Finish the look with court sneakers'},{source:2,target:6,type:'Style with straight-leg denim'},{source:7,target:23,type:'Layer with a soft knit scarf'},{source:13,target:17,type:'Pair with wide-leg trousers'}],
    purchases:[{id:501,supplierId:1,warehouseId:1,variantId:1,quantity:8,cost:Math.round(variants[0].price*.68),status:'Ordered',orderedAt:'2026-10-22T12:00:00Z'}],
    returns:[{id:701,orderId:1042,itemId:'item-3-1',quantity:1,reason:'The sneakers feel too narrow.',status:'Requested',amount:variants.find(v=>v.id===3).price}],
    claims:[{id:801,orderId:1046,itemId:'item-7-1',reason:'The coat seam has come undone after one wear.',status:'Submitted',createdAt:'2026-10-25T12:00:00Z'}],refunds:[],movements:[]};
}
