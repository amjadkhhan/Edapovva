// ============================================================
// LONGEST ROUTE FINDER
// MULTI-WAYPOINT DETOUR VERSION
//
// OpenStreetMap + Dijkstra + Multi-Waypoint Search
// ============================================================


// ============================================================
// MAP
// ============================================================

const map = L.map("map").setView(
    [10.8505, 76.2711],
    13
);

L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        attribution:
            "&copy; OpenStreetMap contributors"
    }
).addTo(map);


// ============================================================
// VARIABLES
// ============================================================

let startPoint = null;
let endPoint = null;

let startMarker = null;
let endMarker = null;

let routeLine = null;


// ============================================================
// UI
// ============================================================

function setInfo(message) {
    document.getElementById("info").innerHTML = message;
}


// ============================================================
// MAP CLICK
// ============================================================

map.on("click", function (e) {

    const point = [
        e.latlng.lat,
        e.latlng.lng
    ];


    // --------------------------------------------------------
    // FIRST CLICK
    // --------------------------------------------------------

    if (!startPoint) {

        startPoint = point;

        startMarker =
            L.marker(point)
                .addTo(map)
                .bindPopup("Start")
                .openPopup();

        setInfo(
            "Start selected.<br>" +
            "Click the destination."
        );

        return;
    }


    // --------------------------------------------------------
    // SECOND CLICK
    // --------------------------------------------------------

    if (!endPoint) {

        endPoint = point;

        endMarker =
            L.marker(point)
                .addTo(map)
                .bindPopup("Destination")
                .openPopup();

        setInfo(
            "Destination selected.<br>" +
            "Click Find Longest Route."
        );

    }

});


// ============================================================
// HAVERSINE
// ============================================================

function calculateDistance(
    lat1,
    lon1,
    lat2,
    lon2
) {

    const R = 6371000;

    const dLat =
        (lat2 - lat1) *
        Math.PI / 180;

    const dLon =
        (lon2 - lon1) *
        Math.PI / 180;

    const a =
        Math.sin(dLat / 2) ** 2 +

        Math.cos(
            lat1 * Math.PI / 180
        ) *

        Math.cos(
            lat2 * Math.PI / 180
        ) *

        Math.sin(dLon / 2) ** 2;

    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    return R * c;
}


// ============================================================
// DIRECT DISTANCE
// ============================================================

function getDirectDistance() {

    return calculateDistance(
        startPoint[0],
        startPoint[1],
        endPoint[0],
        endPoint[1]
    );

}


// ============================================================
// SEARCH AREA
// ============================================================

function getSearchArea() {

    const distance =
        getDirectDistance();


    let buffer;


    if (distance < 3000) {

        buffer = 0.015;

    }
    else if (distance < 7000) {

        buffer = 0.035;

    }
    else if (distance < 15000) {

        buffer = 0.06;

    }
    else {

        buffer = 0.10;

    }


    return {

        south:
            Math.min(
                startPoint[0],
                endPoint[0]
            ) - buffer,

        north:
            Math.max(
                startPoint[0],
                endPoint[0]
            ) + buffer,

        west:
            Math.min(
                startPoint[1],
                endPoint[1]
            ) - buffer,

        east:
            Math.max(
                startPoint[1],
                endPoint[1]
            ) + buffer

    };

}


// ============================================================
// DOWNLOAD OSM
// ============================================================

async function getRoadNetwork() {

    const area =
        getSearchArea();


    const highwayTypes =
        "motorway|motorway_link|" +
        "trunk|trunk_link|" +
        "primary|primary_link|" +
        "secondary|secondary_link|" +
        "tertiary|tertiary_link|" +
        "unclassified|residential";


    const query = `

        [out:json][timeout:60];

        way
        ["highway"~"${highwayTypes}"]
        (${area.south},
         ${area.west},
         ${area.north},
         ${area.east});

        out body;

        >;

        out skel qt;

    `;


    const response =
        await fetch(
            "/api/overpass",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "text/plain"
                },

                body: query
            }
        );


    if (!response.ok) {

        throw new Error(
            "OpenStreetMap request failed."
        );

    }


    return await response.json();

}


// ============================================================
// BUILD GRAPH
// ============================================================

function buildGraph(osmData) {

    const graph = new Map();


    // --------------------------------------------------------
    // NODES
    // --------------------------------------------------------

    for (
        const element
        of osmData.elements
    ) {

        if (
            element.type !== "node"
        ) {

            continue;

        }


        graph.set(
            element.id,
            {

                lat:
                    element.lat,

                lon:
                    element.lon,

                edges:
                    []

            }
        );

    }


    // --------------------------------------------------------
    // ROADS
    // --------------------------------------------------------

    for (
        const way
        of osmData.elements
    ) {

        if (
            way.type !== "way" ||
            !way.nodes ||
            way.nodes.length < 2
        ) {

            continue;

        }


        const tags =
            way.tags || {};


        const oneWay =
            tags.oneway === "yes" ||
            tags.oneway === "1" ||
            tags.oneway === "true";


        for (
            let i = 0;
            i < way.nodes.length - 1;
            i++
        ) {

            const a =
                way.nodes[i];

            const b =
                way.nodes[i + 1];


            if (
                !graph.has(a) ||
                !graph.has(b)
            ) {

                continue;

            }


            const nodeA =
                graph.get(a);

            const nodeB =
                graph.get(b);


            const distance =
                calculateDistance(
                    nodeA.lat,
                    nodeA.lon,
                    nodeB.lat,
                    nodeB.lon
                );


            // Forward

            graph
                .get(a)
                .edges
                .push({

                    node:
                        b,

                    distance:
                        distance

                });


            // Reverse

            if (!oneWay) {

                graph
                    .get(b)
                    .edges
                    .push({

                        node:
                            a,

                        distance:
                            distance

                    });

            }

        }

    }


    return graph;

}


// ============================================================
// REVERSE GRAPH
// ============================================================

function buildReverseGraph(graph) {

    const reverse =
        new Map();


    for (
        const [id, node]
        of graph
    ) {

        reverse.set(
            id,
            {

                lat:
                    node.lat,

                lon:
                    node.lon,

                edges:
                    []

            }

        );

    }


    for (
        const [id, node]
        of graph
    ) {

        for (
            const edge
            of node.edges
        ) {

            reverse
                .get(edge.node)
                .edges
                .push({

                    node:
                        id,

                    distance:
                        edge.distance

                });

        }

    }


    return reverse;

}


// ============================================================
// NEAREST NODE
// ============================================================

function findNearestNode(
    graph,
    point
) {

    let nearest = null;

    let shortest =
        Infinity;


    for (
        const [id, node]
        of graph
    ) {

        const distance =
            calculateDistance(
                point[0],
                point[1],
                node.lat,
                node.lon
            );


        if (
            distance <
            shortest
        ) {

            shortest =
                distance;

            nearest =
                id;

        }

    }


    return nearest;

}


// ============================================================
// MIN HEAP
// ============================================================

class MinHeap {

    constructor() {

        this.heap = [];

    }


    push(item) {

        this.heap.push(item);

        let index =
            this.heap.length - 1;


        while (
            index > 0
        ) {

            const parent =
                Math.floor(
                    (index - 1) / 2
                );


            if (
                this.heap[parent].distance <=
                this.heap[index].distance
            ) {

                break;

            }


            [
                this.heap[parent],
                this.heap[index]
            ] = [

                this.heap[index],
                this.heap[parent]

            ];


            index =
                parent;

        }

    }


    pop() {

        if (
            this.heap.length === 0
        ) {

            return null;

        }


        const result =
            this.heap[0];


        const last =
            this.heap.pop();


        if (
            this.heap.length > 0
        ) {

            this.heap[0] =
                last;


            let index = 0;


            while (true) {

                let smallest =
                    index;


                const left =
                    index * 2 + 1;

                const right =
                    index * 2 + 2;


                if (
                    left <
                    this.heap.length &&
                    this.heap[left].distance <
                    this.heap[smallest].distance
                ) {

                    smallest =
                        left;

                }


                if (
                    right <
                    this.heap.length &&
                    this.heap[right].distance <
                    this.heap[smallest].distance
                ) {

                    smallest =
                        right;

                }


                if (
                    smallest === index
                ) {

                    break;

                }


                [
                    this.heap[index],
                    this.heap[smallest]
                ] = [

                    this.heap[smallest],
                    this.heap[index]

                ];


                index =
                    smallest;

            }

        }


        return result;

    }


    get size() {

        return this.heap.length;

    }

}


// ============================================================
// DIJKSTRA
//
// Finds shortest distances from one node.
// ============================================================

async function dijkstra(
    graph,
    start
) {

    const distances =
        new Map();


    const previous =
        new Map();


    const heap =
        new MinHeap();


    for (
        const id
        of graph.keys()
    ) {

        distances.set(
            id,
            Infinity
        );

        previous.set(
            id,
            null
        );

    }


    distances.set(
        start,
        0
    );


    heap.push({

        node:
            start,

        distance:
            0

    });


    let processed = 0;


    while (
        heap.size > 0
    ) {

        const current =
            heap.pop();


        if (
            current.distance !==
            distances.get(
                current.node
            )
        ) {

            continue;

        }


        processed++;


        if (
            processed % 5000 === 0
        ) {

            setInfo(

                `Running Dijkstra...<br><br>` +

                `Nodes processed: ${processed}`

            );


            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        0
                    )
            );

        }


        const node =
            graph.get(
                current.node
            );


        for (
            const edge
            of node.edges
        ) {

            const newDistance =
                current.distance +
                edge.distance;


            if (
                newDistance <
                distances.get(
                    edge.node
                )
            ) {

                distances.set(
                    edge.node,
                    newDistance
                );


                previous.set(
                    edge.node,
                    current.node
                );


                heap.push({

                    node:
                        edge.node,

                    distance:
                        newDistance

                });

            }

        }

    }


    return {

        distances:
            distances,

        previous:
            previous

    };

}


// ============================================================
// RECONSTRUCT PATH
// ============================================================

function reconstructPath(
    previous,
    start,
    destination
) {

    const path = [];

    let current =
        destination;


    while (
        current !== null
    ) {

        path.unshift(
            current
        );


        if (
            current === start
        ) {

            break;

        }


        current =
            previous.get(
                current
            );

    }


    if (
        path.length === 0 ||
        path[0] !== start
    ) {

        return null;

    }


    return path;

}


// ============================================================
// DISTANCE FROM LINE
// ============================================================

function distanceFromLine(
    node,
    start,
    end
) {

    const x =
        node.lon;

    const y =
        node.lat;

    const x1 =
        start.lon;

    const y1 =
        start.lat;

    const x2 =
        end.lon;

    const y2 =
        end.lat;


    const dx =
        x2 - x1;

    const dy =
        y2 - y1;


    if (
        dx === 0 &&
        dy === 0
    ) {

        return calculateDistance(
            y,
            x,
            y1,
            x1
        );

    }


    const t =
        Math.max(
            0,
            Math.min(
                1,

                (
                    (x - x1) * dx +
                    (y - y1) * dy
                ) /
                (
                    dx * dx +
                    dy * dy
                )

            )
        );


    const closestX =
        x1 + t * dx;


    const closestY =
        y1 + t * dy;


    return calculateDistance(
        y,
        x,
        closestY,
        closestX
    );

}


// ============================================================
// CREATE MULTIPLE WAYPOINT CANDIDATES
// ============================================================

function createWaypoints(
    graph,
    startNode,
    endNode,
    fromStart,
    fromEnd
) {

    const start =
        graph.get(
            startNode
        );


    const end =
        graph.get(
            endNode
        );


    const directDistance =
        calculateDistance(
            start.lat,
            start.lon,
            end.lat,
            end.lon
        );


    const candidates = [];


    /*
        We want points well away from
        the straight A → B line.
    */

    const minimumSideDistance =
        Math.max(
            700,
            directDistance * 0.12
        );


    for (
        const [id, node]
        of graph
    ) {

        if (
            id === startNode ||
            id === endNode
        ) {

            continue;

        }


        const distanceA =
            fromStart.distances.get(
                id
            );


        const distanceB =
            fromEnd.distances.get(
                id
            );


        if (
            distanceA === Infinity ||
            distanceB === Infinity
        ) {

            continue;

        }


        const sideDistance =
            distanceFromLine(
                node,
                start,
                end
            );


        if (
            sideDistance <
            minimumSideDistance
        ) {

            continue;

        }


        /*
            Don't allow ridiculously distant
            points.
        */

        if (
            distanceA >
            directDistance * 3
        ) {

            continue;

        }


        if (
            distanceB >
            directDistance * 3
        ) {

            continue;

        }


        const totalDistance =
            distanceA +
            distanceB;


        candidates.push({

            id:
                id,

            lat:
                node.lat,

            lon:
                node.lon,

            totalDistance:
                totalDistance,

            sideDistance:
                sideDistance

        });

    }


    /*
        Highest potential detours first.
    */

    candidates.sort(
        function (a, b) {

            return (
                b.totalDistance -
                a.totalDistance
            );

        }
    );


    return candidates;

}


// ============================================================
// SELECT WAYPOINTS FROM DIFFERENT PARTS
//
// We don't want 20 points sitting beside each other.
// We divide the map into sections and choose points
// from different sections.
// ============================================================

function selectWaypoints(
    candidates,
    start,
    end
) {

    if (
        candidates.length === 0
    ) {

        return [];

    }


    /*
        8 waypoint positions.

        More waypoints = more branch-like
        / zig-zag route.

        8 is deliberately kept reasonable
        for browser performance.
    */

    const WAYPOINT_COUNT =
        8;


    const selected = [];


    /*
        Calculate position along A → B.
    */

    const dx =
        end.lon - start.lon;

    const dy =
        end.lat - start.lat;


    const sections =
        new Array(
            WAYPOINT_COUNT
        ).fill(null);


    for (
        const candidate
        of candidates
    ) {

        const progress =
            (
                (candidate.lon - start.lon) * dx +
                (candidate.lat - start.lat) * dy
            ) /
            (
                dx * dx +
                dy * dy
            );


        const index =
            Math.max(
                0,
                Math.min(
                    WAYPOINT_COUNT - 1,
                    Math.floor(
                        progress *
                        WAYPOINT_COUNT
                    )
                )
            );


        if (
            !sections[index]
        ) {

            sections[index] =
                candidate;

        }

    }


    /*
        Add available candidates.
    */

    for (
        const candidate
        of candidates
    ) {

        if (
            selected.includes(
                candidate
            )
        ) {

            continue;

        }


        if (
            !selected.some(
                item =>
                    calculateDistance(
                        item.lat,
                        item.lon,
                        candidate.lat,
                        candidate.lon
                    ) < 1500
            )
        ) {

            selected.push(
                candidate
            );

        }


        if (
            selected.length >=
            WAYPOINT_COUNT
        ) {

            break;

        }

    }


    /*
        Prefer section candidates when possible.
    */

    const result = [];


    for (
        const candidate
        of sections
    ) {

        if (
            candidate &&
            !result.some(
                item =>
                    item.id === candidate.id
            )
        ) {

            result.push(
                candidate
            );

        }

    }


    for (
        const candidate
        of selected
    ) {

        if (
            result.length >=
            WAYPOINT_COUNT
        ) {

            break;

        }


        if (
            !result.some(
                item =>
                    item.id === candidate.id
            )
        ) {

            result.push(
                candidate
            );

        }

    }


    return result.slice(
        0,
        WAYPOINT_COUNT
    );

}


// ============================================================
// BUILD MULTI-WAYPOINT ROUTE
//
// Instead of:
//
// A → W → B
//
// we use:
//
// A → W1 → W2 → W3 → ... → B
// ============================================================

async function buildMultiWaypointRoute(
    graph,
    startNode,
    endNode,
    waypoints
) {

    const checkpoints = [

        startNode,

        ...waypoints.map(
            waypoint =>
                waypoint.id
        ),

        endNode

    ];


    const segments = [];


    let totalDistance = 0;


    /*
        For each segment we run Dijkstra.

        With 8 waypoints this means only
        about 9 Dijkstra searches.
    */

    for (
        let i = 0;
        i < checkpoints.length - 1;
        i++
    ) {

        const from =
            checkpoints[i];

        const to =
            checkpoints[i + 1];


        setInfo(

            `Building long route...<br><br>` +

            `Segment ${i + 1} / ` +

            `${checkpoints.length - 1}`

        );


        const result =
            await dijkstra(
                graph,
                from
            );


        const distance =
            result.distances.get(
                to
            );


        if (
            distance === Infinity
        ) {

            return null;

        }


        const path =
            reconstructPath(
                result.previous,
                from,
                to
            );


        if (
            !path
        ) {

            return null;

        }


        segments.push(
            path
        );


        totalDistance +=
            distance;


        /*
            Allow browser to breathe.
        */

        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    0
                )
        );

    }


    // ========================================================
    // COMBINE SEGMENTS
    // ========================================================

    const fullPath = [];


    for (
        const segment
        of segments
    ) {

        if (
            fullPath.length === 0
        ) {

            fullPath.push(
                ...segment
            );

        }

        else {

            fullPath.push(
                ...segment.slice(1)
            );

        }

    }


    /*
        IMPORTANT:

        The final node MUST be destination.
    */

    if (
        fullPath[
            fullPath.length - 1
        ] !== endNode
    ) {

        return null;

    }


    return {

        path:
            fullPath,

        distance:
            totalDistance

    };

}


// ============================================================
// MAIN
// ============================================================

async function findLongestRoute() {

    if (
        !startPoint ||
        !endPoint
    ) {

        alert(
            "Please select two points first."
        );

        return;

    }


    const button =
        document.getElementById(
            "findRoute"
        );


    button.disabled =
        true;


    try {

        // ====================================================
        // DIRECT DISTANCE
        // ====================================================

        const directDistance =
            getDirectDistance();


        setInfo(

            `Direct distance: ` +

            `${(
                directDistance / 1000
            ).toFixed(2)} km<br><br>` +

            `Downloading OpenStreetMap roads...`

        );


        // ====================================================
        // DOWNLOAD
        // ====================================================

        const osmData =
            await getRoadNetwork();


        // ====================================================
        // GRAPH
        // ====================================================

        setInfo(
            "Building road graph..."
        );


        const graph =
            buildGraph(
                osmData
            );


        console.log(
            "Road nodes:",
            graph.size
        );


        if (
            graph.size === 0
        ) {

            throw new Error(
                "No road nodes found."
            );

        }


        // ====================================================
        // START
        // ====================================================

        setInfo(
            "Finding start road..."
        );


        const startNode =
            findNearestNode(
                graph,
                startPoint
            );


        // ====================================================
        // DESTINATION
        // ====================================================

        setInfo(
            "Finding destination road..."
        );


        const endNode =
            findNearestNode(
                graph,
                endPoint
            );


        if (
            !startNode ||
            !endNode
        ) {

            throw new Error(
                "Could not find nearby roads."
            );

        }


        // ====================================================
        // REVERSE GRAPH
        // ====================================================

        setInfo(
            "Preparing reverse graph..."
        );


        const reverseGraph =
            buildReverseGraph(
                graph
            );


        // ====================================================
        // DISTANCES FROM START
        // ====================================================

        setInfo(
            "Calculating road distances from start..."
        );


        const fromStart =
            await dijkstra(
                graph,
                startNode
            );


        // ====================================================
        // DISTANCES TO DESTINATION
        // ====================================================

        setInfo(
            "Calculating road distances to destination..."
        );


        const fromEnd =
            await dijkstra(
                reverseGraph,
                endNode
            );


        // ====================================================
        // SHORTEST ROUTE
        // ====================================================

        const shortestDistance =
            fromStart
                .distances
                .get(
                    endNode
                );


        if (
            shortestDistance === Infinity
        ) {

            throw new Error(

                "Start and destination are not connected."

            );

        }


        // ====================================================
        // CREATE CANDIDATES
        // ====================================================

        setInfo(
            "Finding possible detour roads..."
        );


        const candidates =
            createWaypoints(
                graph,
                startNode,
                endNode,
                fromStart,
                fromEnd
            );


        console.log(
            "Detour candidates:",
            candidates.length
        );


        if (
            candidates.length === 0
        ) {

            throw new Error(
                "No suitable detour roads found."
            );

        }


        // ====================================================
        // SELECT DIFFERENT AREAS
        // ====================================================

        setInfo(
            "Selecting multiple detour areas..."
        );


        const startGraphNode =
            graph.get(
                startNode
            );


        const endGraphNode =
            graph.get(
                endNode
            );


        const waypoints =
            selectWaypoints(
                candidates,
                startGraphNode,
                endGraphNode
            );


        console.log(
            "Selected waypoints:",
            waypoints.length
        );


        if (
            waypoints.length < 2
        ) {

            throw new Error(
                "Not enough detour areas available."
            );

        }


        // ====================================================
        // SHOW SEARCH
        // ====================================================

        setInfo(

            `Selected ${waypoints.length} ` +
            `detour areas.<br><br>` +

            `Building multi-waypoint route...`

        );


        // ====================================================
        // BUILD ROUTE
        // ====================================================

        const result =
            await buildMultiWaypointRoute(
                graph,
                startNode,
                endNode,
                waypoints
            );


        if (!result) {

            throw new Error(

                "Could not connect all detour areas. " +
                "Try points closer together."

            );

        }


        // ====================================================
        // MAP COORDINATES
        // ====================================================

        const coordinates =
            result.path.map(
                function (id) {

                    const node =
                        graph.get(id);


                    return [

                        node.lat,

                        node.lon

                    ];

                }
            );


        // ====================================================
        // EXACT START
        // ====================================================

        coordinates.unshift(
            [
                startPoint[0],
                startPoint[1]
            ]
        );


        // ====================================================
        // EXACT DESTINATION
        // ====================================================

        coordinates.push(
            [
                endPoint[0],
                endPoint[1]
            ]
        );


        // ====================================================
        // REMOVE OLD ROUTE
        // ====================================================

        if (routeLine) {

            map.removeLayer(
                routeLine
            );

        }


        // ====================================================
        // DRAW ROUTE
        // ====================================================

        routeLine =
            L.polyline(
                coordinates,
                {
                    weight: 6
                }
            ).addTo(map);


        // ====================================================
        // ZOOM
        // ====================================================

        map.fitBounds(
            routeLine.getBounds()
        );


        // ====================================================
        // RESULTS
        // ====================================================

        const longestKm =
            (
                result.distance /
                1000
            ).toFixed(2);


        const shortestKm =
            (
                shortestDistance /
                1000
            ).toFixed(2);


        const directKm =
            (
                directDistance /
                1000
            ).toFixed(2);


        const ratio =
            (
                result.distance /
                shortestDistance
            ).toFixed(2);


        setInfo(

            `<b>Longest route found</b><br><br>` +

            `Longest route: ${longestKm} km<br>` +

            `Shortest road route: ${shortestKm} km<br>` +

            `Direct distance: ${directKm} km<br>` +

            `Detour ratio: ${ratio}×<br><br>` +

            `Road nodes: ${graph.size}<br>` +

            `Detour points: ${waypoints.length}`

        );

    }

    catch (error) {

        console.error(
            error
        );


        setInfo(

            `<b>Error</b><br><br>` +

            error.message

        );

    }

    finally {

        button.disabled =
            false;

    }

}


// ============================================================
// BUTTON
// ============================================================

document
    .getElementById("findRoute")
    .addEventListener(
        "click",
        findLongestRoute
    );