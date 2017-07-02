var express = require('express');
var app = express();
var cors = require('cors');
var bodyParser = require('body-parser');
app.use(express.static('.'));
app.use(cors());
app.use(bodyParser());
var port = 5000;

loopCounter = 0;

var MongoClient = require('mongodb').MongoClient;

dbURL = "mongodb://localhost:27017/gridlock";
// Connect to the db
MongoClient.connect(dbURL, function (err, database) {
    if (!err) {
        console.log("connected to gridlockDB ");
        db = database;
    }
});



var googleMapsClient = require('@google/maps').createClient({
    key: 'AIzaSyDfDUIc2ZVvwAqNLW1nHZwP7teXf7xlFA4'
});






function timeBkt(time){
    timeArray = time.split(":");
    hour = timeArray[0];
    minute = timeArray[1];

    if(minute < 15){
        minute = 15;
    }
    else if(minute > 15 && minute < 30){
        minute = 30;
    }
    else if(minute > 30 && minute < 45 ){
        minute = 45;
    }
    else{
        minute = 0;
        +hour++;
    }

    timeBucket = hour + ":" +minute;

    return timeBucket;  
}

function cummulativeTime(time, duration) {
    if (duration < 60) {
        duration = 60;
    }
    durationInMin = Math.ceil(duration / 60);
    timeArray = time.split(':');
    hour = timeArray[0];
    minute = timeArray[1];
    if ((+minute + +durationInMin) < 60) {
        minute = +minute + +durationInMin;
    }
    else {
        minute = +minute + +durationInMin - 60;
        hour++;
    }
    finalTime = hour + ":" + minute;
    return finalTime;
}

function updateTimeSlotCount(loopCounter, len, polycount , result) {
    console.log(result);
    if (loopCounter <= 0) { return }
    else {
        i = len - loopCounter;
        loopCounter--;
        start_x = result.routes[polycount].legs[0].steps[i].start_location.lat;
        start_y = result.routes[polycount].legs[0].steps[i].start_location.lng;
        end_x = result.routes[polycount].legs[0].steps[i].end_location.lat;
        end_y = result.routes[polycount].legs[0].steps[i].end_location.lng;
        routeKey = start_x + '-' + start_y + '-' + end_x + '-' + end_y;
        routePoly = result.routes[polycount].overview_polyline.points
        durationInSec = result.routes[polycount].legs[0].steps[i].duration.value;
        time = cummulativeTime(tempTime, durationInSec);
        timeBucket = timeBkt(time);
        tempTime = time;
        insertTime = "timezone." + time;
        insertTimeBucket = 'timebucketzone.' +timeBucket 
        db.collection('routelegs').findOne({ _id: routeKey }, function (error, res) {
            if (!error && res) {
                db.collection('routelegs').update({ _id: routeKey , routepoly : routePoly } ,{ $inc: { [insertTime]: 1 , [insertTimeBucket] : 1 } }, function (err1, res1) {
                    if (!err1) {
                        updateTimeSlotCount(loopCounter, len, polycount ,  result);
                    }
                    else {
                        console.log(err);
                    }
                })
            }
            else {
                var obj = { _id: routeKey, routepoly : routePoly , timebucket : timeBucket, timebucketzone : {[timeBucket] : 1 } ,timezone: { [time]: 1 } };
                db.collection('routelegs').insertOne(obj, function (err, resp) {
                    if (!err) {
                        updateTimeSlotCount(loopCounter, len, polycount , result);
                    }
                    else {
                        console.log(err);
                    }
                })
            }
        });
    }
}







app.get("/", function (req, res) {
    res.sendFile(__dirname + '/helloworld.html');
})


app.post('/distanceMatrix', function (req, res) {
    console.log(" in the api ");
    console.log(req.body)
    // console.log(req.query);

    var geocodeParams = {
        "origins": req.body.origin,
        "destinations": req.body.destination,
        "language": "en",
        "region": "India"
    };

    googleMapsClient.distanceMatrix(geocodeParams, function (err, result) {
        if (err) {
            console.log(err);
        }
        else {
            res.send(result);
        }
    })
})

app.post('/direction', function (req, res) {

    var collection = db.collection('routelegs');

    polycount = req.body.polycount;

    var directionParams = {
        "origin": req.body.origin,
        "destination": req.body.destination,
        "mode": "driving",
        "alternatives" : true,
        "language": "en",
        "region": "India"
    };

    departTime = req.body.departTime;

    tempTime = departTime;

    googleMapsClient.directions(directionParams, function (err, result) {
        if (err) {
            console.log(err);
            res.send({
                'status' : 'ERROR',
                'msg' : err
            })
        }
        else {
            mapResult = result
            // console.log(result);
            len = result.json.routes[polycount].legs[0].steps.length;
            direction = "";
            loopCounter = len;
            // console.log(result.json.routes);
            updateTimeSlotCount(loopCounter, len, polycount , mapResult.json);
            res.send({
                'status' : 'Success',
                'data' : direction
            });
        }
    })
})

app.get('/getallroutes' , function(req , res){
        var directionParams = {
        "origin": req.query.origin,
        "destination": req.query.destination,
        "mode": "driving",
        "alternatives" : true,
        "language": "en",
        "region": "India"
    };

        googleMapsClient.directions(directionParams, function (err, result) {
            if (err) {
                console.log(err);
                res.send({
                    'status' : 'ERROR',
                    'msg' : err
                })
            }
            else {

                res.send({
                    'status' : 'Success',
                    'data' : result
                });
            }
        })
})

app.post('/routestats' , function(req , res){
    timezone = req.body.timezone;
    timebucket = timeBkt(timezone);
    routePoly = req.body.routepoly;
    console.log(routePoly)
    db.collection('routelegs').aggregate(
        [
            {
                $match : {'routepoly' : routePoly }
            },

            {$group : { '_id' : '$routepoly' , sumtime : {$sum : '$timebucketzone.' + timebucket }  } }
        ]
        , function(err , data){
            if(!err && data){
                console.log(data);
                res.send({
                    'status' : 'Success',
                    'data' : data
                })
            }
            else{
                console.log(err);
            }
        }
    )
})


app.listen(port, function () {
    console.log("Server running on port " + port);
})