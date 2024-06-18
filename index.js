const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const port = process.env.PORT || 8000

const app = express()

// middleware
const corsOptions = {
    origin: [
        'http://localhost:5173',
        'http://localhost:5174',
        'https://navigate-bd.web.app'
    ],
    credentials: true,
    optionSuccessStatus: 200,
}
app.use(cors(corsOptions));
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jakl9vf.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {

        const packagesCollection = client.db('navigateBd').collection('packages')
        const wishlistCollection = client.db('navigateBd').collection('wishlist')
        const userCollection = client.db('navigateBd').collection('users')
        const storyCollection = client.db('navigateBd').collection('story')
        const bookingsCollection = client.db('navigateBd').collection('bookings')

        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        // jwt related api
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '1h'
            });
            res.send({ token });
        })

        // middlewares for verify token
        const verifyToken = (req, res, next) => {
            console.log('inside verify token', req.headers.authorization);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'unauthorized access' });
            }
            const token = req.headers.authorization.split(' ')[1]
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' });
                }
                req.decoded = decoded;
                next();
            })
        }

        // post user to db
        app.post('/users', async (req, res) => {
            const user = req.body;

            const query = { email: user.email }
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'User already exists', insertedId: null })
            }
            const result = await userCollection.insertOne(user);
            res.send(result)
        });

        // use verify admin after verifyToken
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin'
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }

        // get all users from db
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {

            const result = await userCollection.find().toArray();
            res.send(result);
        })

        // make a user to admin in db
        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc)
            res.send(result);
        })

        // make a user/tourist to guide in db
        app.patch('/users/guide/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'guide'
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc)
            res.send(result);
        })

        // Endpoint to fetch guides from users of db
        app.get('/user/guides', async (req, res) => {
            try {
                const guides = await userCollection.find({ role: 'guide' }).toArray();
                res.send(guides);
            } catch (err) {
                console.error(err.message);
                res.status(500).send('Server Error');
            }
        });

        // get a guide from users by id
        app.get('/guides/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await userCollection.findOne(query);
            res.send(result);
        })

        // delete user from db
        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await userCollection.deleteOne(query);
            res.send(result);
        })

        // check the user Admin or not
        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }

            const query = { email: email };
            const user = await userCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin'
            }
            res.send({ admin });
        })

        // post package by admin to db
        app.post('/packages', verifyToken, verifyAdmin, async (req, res) => {
            const item = req.body;
            const result = await packagesCollection.insertOne(item);
            res.send(result);
        })

        // get all packages from db
        app.get('/packages', async (req, res) => {
            const result = await packagesCollection.find().toArray()
            res.send(result)
        })

        // get a package by id
        app.get('/packages/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await packagesCollection.findOne(query);
            res.send(result);
        })

        // update or edit a package by id with admin
        app.patch('/packages/:id', verifyToken, verifyAdmin, async (req, res) => {
            const item = req.body;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    title: item.title,
                    type: item.type,
                    duration: item.duration,
                    description: item.description,
                    image: item.image,
                    cost: item.cost,
                    day: {
                        day1: item.day.day1,
                        day2: item.day.day2,
                        day3: item.day.day3
                    },
                    posted_by: {
                        name: item.posted_by.name,
                        email: item.posted_by.email,
                        photo: item.posted_by.photo
                    },
                    edited_by: {
                        name: item.edited_by.name,
                        email: item.edited_by.email,
                        photo: item.edited_by.photo
                    }
                }
            }
            const result = await packagesCollection.updateOne(filter, updatedDoc)
            res.send(result);
        })

        // delete a package by admin
        app.delete('/packages/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await packagesCollection.deleteOne(query);
            res.send(result);
        })

        // wishlist collection post
        app.post('/wish', async (req, res) => {
            const cartItem = req.body;
            const result = await wishlistCollection.insertOne(cartItem);
            res.send(result)
        })

        // get from wishlist
        app.get('/wish', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const result = await wishlistCollection.find(query).toArray();
            res.send(result);
        });

        // delete from wishlist
        app.delete('/wish/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await wishlistCollection.deleteOne(query);
            res.send(result);
        })

        // get all story from db
        app.get('/stories', async (req, res) => {

            const result = await storyCollection.find().toArray();
            res.send(result);
        })

        // get a story from db by id
        app.get('/story/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await storyCollection.findOne(query);
            res.send(result);
        })

        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Hello from Navigate-BD server')
})


app.listen(port, () => console.log(`Navigate-BD server running on port ${port}`))