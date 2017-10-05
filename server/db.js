let ReasonDB;
let Redisclient = redis.createClient();

if (typeof window === 'undefined') {
	ReasonDB = require('reasondb');
  ReasonDB.RedisStore = require('ReasonDB/lib/drivers/RedisStore')(ReasonDB);
}

// Create a database at the directory location provided, using `@key` as the primary key on all objects.
// Store data using `localStorage`. In the browser this is `window.localStorage`, and the directory location is ignored.
// On the server JSON files are created. The first argument `true` forces the creation of new storage and indexes each
// time the example is run; the second ensures objects are activated.
let db = new ReasonDB('./examples/load/db', '@key', ReasonDB.RedisStore, false, true, {
  RedisClient: RedisClient
});

// Define a User class.
class User {
	constructor (id) {
		this.id = id;
	}
}

// Create a streaming analytics rule that fires every time a User is added to the database.
//db.when({$p: {name: {$neq: null}, partner: undefined}}).from({$p: User}).select().then((cursor) => {
//	cursor.forEach((row) => {
//		console.log("New " + row[0].constructor.name + ":",JSON.stringify(row[0]));
//	});
//});

function now () {
	if (typeof window !== 'undefined' && 'performance' in window) {
		return window.performance.now();
	}
	return Date.now();
}

const count = 1000;
let data = [];
while (data.length < count) {
	data.push({name: 'person' + data.length});
}

let start = now();
let next;
db.insert(...data).into(User).exec().then(results => {
	next = now();
	console.log("insert records/sec ", count / ((next - start) / 1000));
}).then(() => {
	db.select().from({$p: User}).where({$p: {name: {$neq: null}}}).exec().then(cursor => {
		let end = now();
		console.log("select records/sec ", cursor.maxCount / ((end - next) / 1000));
	});
});
