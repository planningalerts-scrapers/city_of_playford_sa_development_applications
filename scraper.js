// Parses the development applications at the South Australian City of Playford web site and places
// them in a database.
//
// Michael Bone
// 5th August 2018
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cheerio = require("cheerio");
const parse = require("csv-parse/lib/sync");
const request = require("request-promise-native");
const sqlite3 = require("sqlite3");
const moment = require("moment");
sqlite3.verbose();
const DevelopmentApplicationsUrl = "https://data.sa.gov.au/data/dataset/development-application-register";
const CommentUrl = "mailto:Playford@playford.sa.gov.au";
// Sets up an sqlite database.
async function initializeDatabase() {
    return new Promise((resolve, reject) => {
        let database = new sqlite3.Database("data.sqlite");
        database.serialize(() => {
            database.run("create table if not exists [data] ([council_reference] text primary key, [address] text, [description] text, [info_url] text, [comment_url] text, [date_scraped] text, [date_received] text, [on_notice_from] text, [on_notice_to] text)");
            resolve(database);
        });
    });
}
// Inserts a row in the database if it does not already exist.
async function insertRow(database, developmentApplication) {
    return new Promise((resolve, reject) => {
        let sqlStatement = database.prepare("insert or replace into [data] values (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        sqlStatement.run([
            developmentApplication.applicationNumber,
            developmentApplication.address,
            developmentApplication.reason,
            developmentApplication.informationUrl,
            developmentApplication.commentUrl,
            developmentApplication.scrapeDate,
            developmentApplication.receivedDate,
            null,
            null
        ], function (error, row) {
            if (error) {
                console.error(error);
                reject(error);
            }
            else {
                if (this.changes > 0)
                    console.log(`    Inserted: application \"${developmentApplication.applicationNumber}\" with address \"${developmentApplication.address}\" and reason \"${developmentApplication.reason}\" into the database.`);
                else
                    console.log(`    Skipped: application \"${developmentApplication.applicationNumber}\" with address \"${developmentApplication.address}\" and reason \"${developmentApplication.reason}\" because it was already present in the database.`);
                sqlStatement.finalize(); // releases any locks
                resolve(row);
            }
        });
    });
}
// Gets a random integer in the specified range: [minimum, maximum).
function getRandom(minimum, maximum) {
    return Math.floor(Math.random() * (Math.floor(maximum) - Math.ceil(minimum))) + Math.ceil(minimum);
}
// Parses the development applications.
async function main() {
    // Ensure that the database exists.
    let database = await initializeDatabase();
    // Retrieve the main page.
    console.log(`Retrieving page: ${DevelopmentApplicationsUrl}`);
    let body = await request({ url: DevelopmentApplicationsUrl });
    let $ = cheerio.load(body);
    // Find all CSV URLs on the main page.
    let urls = [];
    for (let element of $("a.resource-url-analytics").get())
        if (!urls.some(url => url === element.attribs.href))
            urls.push(element.attribs.href);
    if (urls.length === 0) {
        console.log(`No CSV files to parse were found on the page: ${DevelopmentApplicationsUrl}`);
        return;
    }
    // Retrieve two of the development application CSV files (the most recent and one other random
    // selection).  Retrieving all development application CSV files may otherwise use too much
    // memory and result in morph.io terminating the current process.
    let selectedUrls = [urls.pop()];
    if (urls.length >= 1)
        selectedUrls.push(urls[getRandom(0, urls.length)]);
    for (let url of selectedUrls) {
        console.log(`Retrieving: ${url}`);
        let body = await request({ url: url });
        let rows = parse(body);
        if (rows.length === 0)
            continue;
        // Determine which columns contain the required development application information.
        let applicationNumberColumnIndex = -1;
        let receivedDateColumnIndex = -1;
        let reasonColumnIndex = -1;
        let addressColumnIndex1 = -1;
        let addressColumnIndex2 = -1;
        for (let columnIndex = 0; columnIndex < rows[0].length; columnIndex++) {
            let cell = rows[0][columnIndex];
            if (cell === "ApplicationNumber")
                applicationNumberColumnIndex = columnIndex;
            else if (cell === "LodgementDate")
                receivedDateColumnIndex = columnIndex;
            else if (cell === "ApplicationDesc")
                reasonColumnIndex = columnIndex;
            else if (cell === "PropertyAddress")
                addressColumnIndex1 = columnIndex;
            else if (cell === "PropertySuburbPostCode")
                addressColumnIndex2 = columnIndex;
        }
        if (applicationNumberColumnIndex < 0 || (addressColumnIndex1 < 0 && addressColumnIndex2 < 0)) {
            console.log(`Could not parse any development applications from ${url}.`);
            continue;
        }
        // Extract the development application information.
        let developmentApplications = [];
        for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
            let row = rows[rowIndex];
            let applicationNumber = row[applicationNumberColumnIndex].trim();
            let address1 = (addressColumnIndex1 < 0) ? "" : row[addressColumnIndex1].trim();
            let address2 = (addressColumnIndex2 < 0) ? "" : row[addressColumnIndex2].trim();
            let reason = (reasonColumnIndex < 0) ? "" : row[reasonColumnIndex].trim();
            let receivedDate = moment(((receivedDateColumnIndex < 0) ? null : row[receivedDateColumnIndex].trim()), "D/MM/YYYY HH:mm:ss A", true); // allows the leading zero of the day to be omitted
            let address = address1 + ((address1 !== "" && address2 !== "") ? " " : "") + address2;
            address = address.trim().replace(/\s\s+/g, " "); // reduce multiple consecutive spaces in the address to a single space
            if (applicationNumber !== "" && address !== "")
                await insertRow(database, {
                    applicationNumber: applicationNumber,
                    address: address,
                    reason: ((reason === "") ? "No description provided" : reason),
                    informationUrl: url,
                    commentUrl: CommentUrl,
                    scrapeDate: moment().format("YYYY-MM-DD"),
                    receivedDate: receivedDate.isValid() ? receivedDate.format("YYYY-MM-DD") : ""
                });
        }
    }
}
main().then(() => console.log("Complete.")).catch(error => console.error(error));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NyYXBlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNjcmFwZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsbUdBQW1HO0FBQ25HLHNCQUFzQjtBQUN0QixFQUFFO0FBQ0YsZUFBZTtBQUNmLGtCQUFrQjtBQUVsQixZQUFZLENBQUM7O0FBRWIsbUNBQW1DO0FBQ25DLDRDQUE0QztBQUM1QyxrREFBa0Q7QUFDbEQsbUNBQW1DO0FBQ25DLGlDQUFpQztBQUVqQyxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7QUFFbEIsTUFBTSwwQkFBMEIsR0FBRyxzRUFBc0UsQ0FBQztBQUMxRyxNQUFNLFVBQVUsR0FBRyxvQ0FBb0MsQ0FBQztBQUV4RCw4QkFBOEI7QUFFOUIsS0FBSyxVQUFVLGtCQUFrQjtJQUM3QixPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1FBQ25DLElBQUksUUFBUSxHQUFHLElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNuRCxRQUFRLENBQUMsU0FBUyxDQUFDLEdBQUcsRUFBRTtZQUNwQixRQUFRLENBQUMsR0FBRyxDQUFDLDBPQUEwTyxDQUFDLENBQUM7WUFDelAsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3RCLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQyxDQUFDLENBQUM7QUFDUCxDQUFDO0FBRUQsOERBQThEO0FBRTlELEtBQUssVUFBVSxTQUFTLENBQUMsUUFBUSxFQUFFLHNCQUFzQjtJQUNyRCxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1FBQ25DLElBQUksWUFBWSxHQUFHLFFBQVEsQ0FBQyxPQUFPLENBQUMsa0VBQWtFLENBQUMsQ0FBQztRQUN4RyxZQUFZLENBQUMsR0FBRyxDQUFDO1lBQ2Isc0JBQXNCLENBQUMsaUJBQWlCO1lBQ3hDLHNCQUFzQixDQUFDLE9BQU87WUFDOUIsc0JB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