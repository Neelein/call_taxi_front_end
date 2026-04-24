const DOMAN_NAME = "http://127.0.0.1:8080"
const WEBSOCKEt = "ws://127.0.0.1:5000"
const DEFAULTLAT =  35.6812
const DEFAULTLNG =  139.7671
const DRIVER_TASK_FINISH = "Finish"
const DRIVER_TASK_SEND = "Send"
const DRIVER_STATUS = "busy_driver"
const ORDER_CANCEL = "Cancel"
const DRIVER_PICK ="Pick Up"
const UPDATE_INTERVAL = 2000;
const NEAR_DRIVER_NOT_FOUND = "near driver not found!!"
const SERVER_BUSY = "Server is busy"
const POSITION_CANT_ARRIVE = "Position can't arrive!!"
const NO_AVAILABLE_DRIVER = "No available driver !!"
const ORDER_STATUS_PROCESS = "process"
const ORDER_FINISH         = "order is complete!!"
const NO_BINDING_DRIVER     = "no follow driver"

let map;
let originMarker            //depature position
let destAutocompleteMaker   //destionation position
let followingDriver         // followinging pick up and send driver
let directionsRenderer;     
let originAutocomplete;
let destAutocomplete;
let originInput = document.getElementById('origin-input')
let destinationInput = document.getElementById('destination-input')
let originLocation
let destinationLocation
let driverMarkers = new Map();
let directionsService
let heartbeatInterval;
let serverTimeout;
let cars = [
    "https://img.icons8.com/?size=60&id=aFtxvwbyU5Lk&format=png&color=000000",
    "https://img.icons8.com/?size=60&id=aFtxvwbyU5Lk&format=png&color=000000",
    "https://img.icons8.com/?size=60&id=L58KkBu4Ipxa&format=png&color=000000",
    "https://img.icons8.com/?size=60&id=jDVnzQWzjDus&format=png&color=000000",
    "https://img.icons8.com/?size=60&id=8pPVgDZPZTED&format=png&color=000000",
    "https://img.icons8.com/?size=60&id=iyyCHU7zr9c1&format=png&color=000000",
    "https://img.icons8.com/?size=60&id=QhCtitxJD7Oy&format=png&color=000000",
    "https://img.icons8.com/?size=60&id=sVRZVf6vUzlK&format=png&color=000000",
    "https://img.icons8.com/?size=60&id=ZZDfcBOzbK1G&format=png&color=000000"  
]

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'visible') {
        GetSession(); 
    }
});

async function GetSession(){
    try{
        const res= await fetch(DOMAN_NAME + "/v1/getsession",{
            credentials: 'include'
        })

        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        data = await res.json()
        await connectSocketServer(data.id)
        await getLatestOrder(data.id)

    }catch(err){
        console.log("error data: ",err)
    }
}

function Order(){
    let request = {
        origin: originMarker.getPosition(),
        destination: destAutocompleteMaker.getPosition(),
        travelMode: 'DRIVING'
    };
    directionsService.route(request, async (result, status) => {
        if (status === 'OK') {
            let snappedOrigin = result.routes[0].legs[0].start_location;
            let snappedDestination = result.routes[0].legs[0].end_location;
            originMarker.setPosition(snappedOrigin);
            destAutocompleteMaker.setPosition(snappedDestination);
            data= {
                    departure_lat: snappedOrigin.lat(),
                    departure_lng:snappedOrigin.lng(),
                    destination_lat:snappedDestination.lat(),
                    destination_lng:snappedDestination.lng(),
                    departure_addr:originInput.value,
                    destination_addr:destinationInput.value
                }

                let  res = await sendOrder(data)

                if (res !== null){
                    bindingOrderInfo(res)
                    originInput.disabled = true
                    destinationInput.disabled = true
                    document.getElementById('order_button').disabled = true
                    document.getElementById('order_button').style.backgroundColor = "lightgray";
                }
        } else {
            alert(POSITION_NOT_EXIST + status);
        }
    });
}

async function CancelOrder(){
    try{
        let id = document.getElementById('order-id-tag').innerText.split('#')[1]     
        data = {
            id : parseInt(id)
        }
        const response = await fetch(DOMAN_NAME+"/v1/cancelorder", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            credentials: 'include'
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        resData = await response.json()

        if (resData.hasOwnProperty('message')){
            if (resData.message == ORDER_FINISH){
                window.alert(ORDER_FINISH)
            }
            return
        }

        originMarker.setVisible(false)
        destAutocompleteMaker.setVisible(false)
        originInput.disabled = false
        destinationInput.disabled = false
        document.getElementById('order_button').disabled = false
        document.getElementById('order_button').style.backgroundColor = "#4285F4";
        originInput.value = ""
        destinationInput.value = ""    
        bindingOrderInfo(resData)


    }catch(err){
        console.error('Fetch error:',err)
    }
}

function UnfallowDriver(){

    if(!followingDriver){
        window.alert(NO_BINDING_DRIVER)
        return
    }

    if (!followingDriver.unFollowMark){
        document.getElementById("unfallow_driver").innerText = "ドライバーをフォローする"
        followingDriver.unFollowMark = true
    }else{
        document.getElementById("unfallow_driver").innerText = "フォローを解除する"
        followingDriver.unFollowMark  = false
    }
}

function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        zoom: 10,
        center: { lat: DEFAULTLAT, lng: DEFAULTLNG },
        mapTypeControl: false
    });

    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
        map: map,
        suppressInfoWindows: true
    });

    originMarker= new google.maps.Marker({
        map: map,
        anchorPoint: new google.maps.Point(0, -29),
        icon:"https://img.icons8.com/?size=50&id=114446&format=png&color=000000"
    });

    originAutocomplete = new google.maps.places.Autocomplete(originInput);
    originAutocomplete.addListener("place_changed",() => {
        originMarker.setVisible(false)
        const place = originAutocomplete.getPlace();

        originLocation = {
            lat:place.geometry.location.lat(),
            lng:place.geometry.location.lng(),
            address:place.formatted_address
        }

        if (!place.geometry || !place.geometry.location) {
            window.alert("Location not exist: '" + place.name + "'");
            return;
        }

        if (place.geometry.viewport) {
            map.fitBounds(place.geometry.viewport);
        } else {
            map.setCenter(place.geometry.location);
            map.setZoom(13);
        }
        originMarker.setPosition(place.geometry.location)
        originMarker.setVisible(true)
    })

    destAutocompleteMaker= new google.maps.Marker({
        map: map,
        anchorPoint: new google.maps.Point(0, -29),
        icon:"https://img.icons8.com/?size=50&id=Fzu67Eub3E1Q&format=png&color=000000"
    });

    destAutocomplete = new google.maps.places.Autocomplete(destinationInput);
    destAutocomplete.addListener("place_changed",() => {
        destAutocompleteMaker.setVisible(false)
        const place = destAutocomplete.getPlace();
        
        destinationLocation = {
            lat:place.geometry.location.lat(),
            lng:place.geometry.location.lng(),
            address:place.formatted_address
        }

        if (!place.geometry || !place.geometry.location) {
            window.alert("Location not exist: '" + place.name + "'");
            return;
        }

        if (place.geometry.viewport) {
            map.fitBounds(place.geometry.viewport);
        } else {
            map.setCenter(place.geometry.location);
            map.setZoom(13);
        }
        destAutocompleteMaker.setPosition(place.geometry.location)
        destAutocompleteMaker.setVisible(true)
    })
}

async function  connectSocketServer(cusId) {
    const socket = new WebSocket(WEBSOCKEt + `/ws?id=${cusId}`);
    socket.onopen = (event) => {
        heartbeatInterval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ping' }));
        }
        }, 30000);
    };
    socket.onmessage = (event) => {
        let obj = JSON.parse(event.data); 
        let { Id, Lat, Lng,WorkRoute,Status,Task,CusId,OrderId,Count } = obj;
        let pos = { lat: parseFloat(Lat), lng: parseFloat(Lng) };
        let driver
        if (!driverMarkers.has(Id)) { 
            createDriverMark(Id,pos,WorkRoute,Status,Task,Count)
        }
        driver = driverMarkers.get(Id)

        if (!driver.isFinishMark){
            driver.mark.setPosition(pos)
            driver.status =Status     
            driver.pos = pos
            driver.workRoute =WorkRoute 
            driver.task =Task
            driver.maxIndexReached = Count
            if (driver.task == DRIVER_TASK_FINISH.toLowerCase()){
                driver.isFinishMark = true
            }
        }

        if (driver.workRoute.length ===0 && driver.task !==DRIVER_TASK_FINISH.toLowerCase()){
            driver.isSendingMark = false
            driver.isFinishMark = false
            if (driver.navPolyline){
                driver.navPolyline.setMap(null);
                driver.navPolyline = null;
            }
            driver.fullRoutePath = []
        }

        updateDriverLocation(driver)
    };
}

function updateDriverLocation(driver) {
    if (driver.fullRoutePath.length !==0){
        if (driver.task === DRIVER_TASK_SEND.toLowerCase()&&!driver.isSendingMark){
            originMarker.setPosition(null)
            originMarker.setVisible(false)
            if (driver.navPolyline != null) {
                    driver.navPolyline.setMap(null);
                    driver.navPolyline = null;
                }
            let task = document.getElementById('driver-status')
            task.innerText = DRIVER_TASK_SEND
            updateDistance(driver.fullRoutePath[driver.fullRoutePath.length -1])
            driver.isSendingMark = true
        }

        if (driver.isFinishMark){
            destAutocompleteMaker.setPosition(null)
            destAutocompleteMaker.setVisible(false)
            document.getElementById('order_button').disabled = false
            driver.mark.setPosition(driver.pos);
            updateDistance(driver.fullRoutePath[driver.fullRoutePath.length -1])
            driver.fullRoutePath = []
            driver.workRoute = []
            if (driver.navPolyline != null) {
                    driver.navPolyline.setMap(null);
                    driver.navPolyline = null; 
                }
            driver.isFinishMark = false
            driver.isSendingMark = false
            originInput.disabled = false
            destinationInput.disabled = false
            originInput.value = ""
            destinationInput.value = ""
            document.getElementById('driver-status').innerText = ""
            document.getElementById('order-distance').innerText = ""
            document.getElementById('order-time').innerText = ""    
            document.getElementById('order-status').innerText = "complete"
            document.getElementById('order_button').disabled = false
            document.getElementById('order_button').style.backgroundColor = "#4285F4";
            setTimeout(() => {}, 3000)
            return
        }
    }
    
    const now = Date.now();
    if (now - driver.lastUpdateTime < UPDATE_INTERVAL) {
        return; 
    }

    updateNavPath(driver)
    if (parseFloat(driver.pos.lat) == 0.00 && parseFloat(driver.pos.lng) == 0.00){
        driver.mark.setMap(null);
        driverMarkers.delete(driver.id)
        return
    }

    driver.mark.setPosition(driver.pos);
    if (driver.status === DRIVER_STATUS&& !driver.unFollowMark){
        followingDriver = driver
        map.panTo(driver.pos)
        map.setZoom(13);
    }

    driver.lastUpdateTime = now;
}

function updateNavPath(driver) {
    if (driver.fullRoutePath.length === 0 &&driver.workRoute.length ===0){
        return
    }

    if (driver.workRoute.length !==0){
        let newPath = [];
        driver.workRoute.forEach(segment => {
            const decoded = google.maps.geometry.encoding.decodePath(segment.RouteString);
            newPath = newPath.concat(decoded);
        });
        driver.fullRoutePath = newPath;
    }

    // let closestIndex = driver.maxIndexReached;
    // let minDistance = Infinity;
    // let searchEnd = Math.min(driver.fullRoutePath.length, driver.maxIndexReached + 50);

    // for (let i = driver.maxIndexReached; i < searchEnd; i++) {
    //     const distance = google.maps.geometry.spherical.computeDistanceBetween(driver.pos, driver.fullRoutePath[i]);
    //     if (distance < minDistance) {
    //         minDistance = distance;
    //         closestIndex = i;
    //     }
    // }
    // if (closestIndex > driver.maxIndexReached) {

    // }
    // driver.maxIndexReached = closestIndex;
    const remainingPath = driver.fullRoutePath.slice(driver.maxIndexReached);
    if (driver.navPolyline ==null) {
        driver.navPolyline = new google.maps.Polyline({
            path: remainingPath,
            strokeColor: "#4285F4",
            strokeWeight: 4,
            map: map
        });
        updateDistance(driver.fullRoutePath)
    } else {
        driver.navPolyline.setPath(remainingPath);
        updateDistance(remainingPath)
    }
}

function createDriverMark(id,pos,workRoute,status,task,count){
    let mark = {
        id:id,
        mark:new google.maps.Marker({
        position: pos,
        map: map,
        title: `Driver: ${id}`,
        icon: cars[Math.floor(Math.random() * 9)]}),
        lastUpdateTime:0,
        fullRoutePath:[],
        navPolyline: null,
        maxIndexReached: count,
        pos:pos,
        status:status,
        workRoute:workRoute,
        task:task,
        isFinishMark:false,
        isSendingMark:false,
        unFollowMark:false,
    }
    driverMarkers.set(mark.id,mark)
}

async function sendOrder (data){
    try{
        const response = await fetch(DOMAN_NAME +"/v1/calltaxi", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            credentials: 'include'
        });
        if (!response.ok){
            window.alert(SERVER_BUSY)
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        res = await response.json()

        if (res.hasOwnProperty('message')){
            if (res.message == NEAR_DRIVER_NOT_FOUND){
                window.alert(NO_AVAILABLE_DRIVER)
            }
            return null
        }
        return res
    }catch(err){
        console.error('Fetch error:',err)
    }
}

function bindingOrderInfo(data){
    let id = document.getElementById('order-id-tag')
    let driverStatus = document.getElementById('driver-status')
    let price = document.getElementById('order-price')
    let orderStatus = document.getElementById('order-status')
    let driver = driverMarkers.get(data.DriverId)
    id.innerText = "#" + data.id
    price.innerText = data.price + "¥"
    orderStatus.innerText = data.status
    if (data.status == ORDER_CANCEL.toLowerCase() || data.status =="complete" ){
        driverStatus.innerText = "--"
        document.getElementById('order-distance').innerText = ""
        document.getElementById('order-time').innerText = ""
    }else{
        driverStatus.innerText = DRIVER_PICK
    }
}

function updateDistance(remainingPath){
    let orderDistance = document.getElementById('order-distance')
    let orderTime = document.getElementById('order-time')
    const totalMeters = google.maps.geometry.spherical.computeLength(remainingPath);
    const km = (totalMeters / 1000).toFixed(2);
    orderDistance.innerText = km + "km"
    orderTime.innerText = getETATimeString(totalMeters)
}

function getETATimeString(distanceMeters) {
    if (distanceMeters <= 0) return "Arrive";

    const speedKmH = 70;
    const metersPerSecond = speedKmH / 3.6;

    // 2. 計算總秒數
    let totalSeconds = distanceMeters / metersPerSecond;

    // 3. 提取時、分、秒
    const hours = Math.floor(totalSeconds / 3600);
    totalSeconds %= 3600;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);

    // 4. 組合字串
    let result = "";
    if (hours > 0) result += `${hours} 時`;
    if (minutes > 0 || hours > 0) result += `${minutes} 分 `;
    result += `${seconds} 秒`;

    return result;
}

async function getLatestOrder(id){
    try{
        data= {
            id:id
        }
        const response = await fetch(DOMAN_NAME +"/v1/getlatestorder", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            credentials: 'include'
        });
        if (!response.ok){
            window.alert(SERVER_BUSY)
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        let res = await response.json()

        if (res.hasOwnProperty('message')){
            return 
        }
        bindingOrderInfo(res)

        if (res.status == ORDER_STATUS_PROCESS){
            originInput.value = res.departure_addr
            destinationInput.value = res.destination_addr
            originInput.disabled = true
            destinationInput.disabled = true
            document.getElementById('order_button').disabled = true
            document.getElementById('order_button').style.backgroundColor = "lightgray";
            map.setZoom(15);
        }

    }catch(err){
        console.error('Fetch error:',err)
    }
}

GetSession()

