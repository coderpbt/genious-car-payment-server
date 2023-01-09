const express = require('express')
const app = express()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
var cors = require('cors')
require('dotenv').config()
const SSLCommerzPayment = require('sslcommerz-lts')

const store_id = process.env.store_id
const store_passwd = process.env.store_passwd
const is_live = false //true for live, false for sandbox

var jwt = require('jsonwebtoken');
// var token = jwt.sign({ foo: 'bar' }, 'shhhhh');


const port = process.env.PORT || 5000

//middleware 
app.use(cors())
app.use(express.json())


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.wwzdrm6.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


//jwt function
function verifyJWT(req, res, next){
  const authHeader = req.headers.authorization;
  console.log(authHeader);

  if(!authHeader){
      return res.status(401).send({message: 'unauthorized access'});
  }
  const token = authHeader.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOCKEN, function(err, decoded){
      if(err){
        console.log('token vul');
          return res.status(403).send({message: 'Forbidden access'});
      }
      req.decoded = decoded;
      next();
  })
}

async function run() {
  try {
    const serviceCarCollection = client.db("carUserDb").collection("sarveces");
    const orderCarCollection = client.db("carUserDb").collection("orders");
    //data pathabo
    app.get('/sarveces', async(req,res) =>{
      const search = req.query.search
      console.log(search);
      let query = {}
      if (search.length) {
        query = {
          $text : {
            $search: search
          }
        }
      }
      // const query = {price : {$lt : 100}}
       // const query = { price: { $gt: 100, $lt: 300 } }
      // const query = { price: { $eq: 200 } }
      // const query = { price: { $lte: 200 } }
      // const query = { price: { $ne: 150 } }
      // const query = { price: { $in: [20, 40, 150] } }
      // const query = { price: { $nin: [20, 40, 150] } }
      // const query = { $and: [{price: {$gt: 20}}, {price: {$gt: 100}}] }
      const order = req.query.order === "DESC" ? -1 : 1;
      const sort = {price : order}
      const cursor = serviceCarCollection.find(query).sort(sort)
      const result = await cursor.toArray()
      res.send(result)
    })

    //spacie id
    app.get('/sarveces/:id', async(req,res) => {
      const {id} = req.params;
      const query = {_id : ObjectId(id)};
      const result = await serviceCarCollection.findOne(query)

      res.send(result)
    })
    

   /*
    order Api
   */
      //jwt tocken
      app.post('/jwt', (req,res)=>{
        const user = req.body;
        const token = jwt.sign(user, process.env.ACCESS_TOCKEN, {expiresIn : 100000 })
        res.send({token})
      })



    app.get('/orders', async(req,res) =>{

      // const decoded = req.decoded;
            
      //   if(decoded.email !== req.query.email){
      //     return  res.status(403).send({message: 'unauthorized access'})
      //   }

      let query = {};
      if (req.query.email) {
        query = {
          email : req.query.email
        }
      }
      
      const cursor = orderCarCollection.find(query)
      const result = await cursor.toArray()
      res.send(result)
    })

    //ui thake data server a anar jonno
    app.post('/orders', async(req,res) => {
      const order = req.body;
      const {service, email, address} = order;
      if (!service || !email || !address) {
        return res.send({error : "Please provide all the information"})
      }

      const orderProduct = await serviceCarCollection.findOne({_id : ObjectId(order.service)})

      const transID = new ObjectId().toString()
      const data = {
        total_amount: orderProduct.price,
        currency: order.currency,
        tran_id: transID, // use unique tran_id for each api call
        success_url: `http://localhost:5000/payment/success?transID=${transID}`,
        fail_url: `http://localhost:5000/payment/fail?transID=${transID}`,
        cancel_url: 'http://localhost:5000/payment/cancel',
        ipn_url: 'http://localhost:3030/ipn',
        shipping_method: 'Courier',
        product_name: 'Computer.',
        product_category: 'Electronic',
        product_profile: 'general',
        cus_name: order.customer,
        cus_email: order.email,
        cus_add1: 'Dhaka',
        cus_add2: 'Dhaka',
        cus_city: 'Dhaka',
        cus_state: 'Dhaka',
        cus_postcode: '1000',
        cus_country: 'Bangladesh',
        cus_phone: '01711111111',
        cus_fax: '01711111111',
        ship_name: 'Customer Name',
        ship_add1: 'Dhaka',
        ship_add2: 'Dhaka',
        ship_city: 'Dhaka',
        ship_state: 'Dhaka',
        ship_postcode: order.pcode,
        ship_country: 'Bangladesh',
    };
    const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live)
    sslcz.init(data).then(apiResponse => {
        let GatewayPageURL = apiResponse.GatewayPageURL
        orderCarCollection.insertOne({
          ...order,
          price : orderProduct.price,
          transID,
          pasid : false
        })
        res.send({url: GatewayPageURL})
        // res.redirect(GatewayPageURL)
    });

    })

    app.post('/payment/success', async(req,res) => {
      const {transID} = req.query;
      if (!transID) {
        return res.redirect(`http://localhost:3000/payment/fail`);
      }
      const result = await orderCarCollection.updateOne({transID},
         {$set : {pasid : true,  paidAd: new Date()}}
         );
      if (result.modifiedCount > 0) {
        res.redirect(`http://localhost:3000/payment/success?transID=${transID}`);
      }   
    })

    app.post('/payment/fail', async(req,res) => {
      const {transID} = req.query;
      if (!transID) {
        return res.redirect(`http://localhost:3000/payment/fail`);
      }
      const result = await orderCarCollection.deleteOne({transID});
      if (result.deletedCount) {
        res.redirect(`http://localhost:3000/payment/fail`);
      }   
    })


    app.get('/orders/by-trsnstion-id/:id', async(req,res) => {
      const {id} = req.params
      const order = await orderCarCollection.findOne({transID : id}) 

      res.send(order)
    })


    //update order
    app.patch('/orders/:id', async(req, res) => {
      const id = req.params.id;
      const status = req.body.status
      const query = {_id : ObjectId(id)};
      const updateDoc = {
        $set : {
          status : status
        }
      }

      const result = await orderCarCollection.updateOne(query,updateDoc )
      res.send(result)
    })

    //delete order
    app.delete('/orders/:id', async(req,res) => {
      const id = req.params.id;
      const query = {_id : ObjectId(id)};
      const result = await orderCarCollection.deleteOne(query)
      res.send(result)
      console.log(result);
    })


    
  } finally {

  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})