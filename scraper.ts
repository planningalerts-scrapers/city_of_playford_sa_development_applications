// Parses the development applications at the South Australian City of Playford web site and places
// them in a database.
//
// Michael Bone
// 5th August 2018

"use strict";

import * as cheerio from "cheerio";
import * as parse from "csv-parse/lib/sync";
import * as request from "request-promise-native";
import * as sqlite3 from "sqlite3";
import * as moment from "moment";

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
        let sqlStatement = database.prepare("insert or ignore into [data] values (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        sqlStatement.run([
            developmentApplication.applicationNumber,
            developmentApplication.address,
            developmentApplication.description,
            developmentApplication.informationUrl,
            developmentApplication.commentUrl,
            developmentApplication.scrapeDate,
            developmentApplication.receivedDate,
            null,
            null
        ], function(error, row) {
            if (error) {
                console.error(error);
                reject(error);
            } else {
                if (this.changes > 0)
                    console.log(`    Inserted: application \"${developmentApplication.applicationNumber}\" with address \"${developmentApplication.address}\" and description \"${developmentApplication.description}\" into the database.`);
                else
                    console.log(`    Skipped: application \"${developmentApplication.applicationNumber}\" with address \"${developmentApplication.address}\" and description \"${developmentApplication.description}\" because it was already present in the database.`);
                sqlStatement.finalize();  // releases any locks
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

    let urls: string[] = [];
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
    
    let selectedUrls = [ urls.pop() ];
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
        let descriptionColumnIndex = -1;
        let addressColumnIndex1 = -1;
        let addressColumnIndex2 = -1;

        for (let columnIndex = 0; columnIndex < rows[0].length; columnIndex++) {
            let cell: string = rows[0][columnIndex];
            if (cell === "ApplicationNumber")
                applicationNumberColumnIndex = columnIndex;
            else if (cell === "LodgementDate")
                receivedDateColumnIndex = columnIndex;
            else if (cell === "ApplicationDesc")
                descriptionColumnIndex = columnIndex;
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

        for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
            let row = rows[rowIndex];
            let applicationNumber = row[applicationNumberColumnIndex].trim();
            let address1 = (addressColumnIndex1 < 0) ? "" : row[addressColumnIndex1].trim();
            let address2 = (addressColumnIndex2 < 0) ? "" : row[addressColumnIndex2].trim();
            let description = (descriptionColumnIndex < 0) ? "" : row[descriptionColumnIndex].trim();
            let receivedDate = moment(((receivedDateColumnIndex < 0) ? null : row[receivedDateColumnIndex].trim()), "D/MM/YYYY HH:mm:ss A", true);  // allows the leading zero of the day to be omitted
            let address = address1 + ((address1 !== "" && address2 !== "") ? " " : "") + address2;
            address = address.trim().replace(/\s\s+/g, " ");  // reduce multiple consecutive spaces in the address to a single space

            if (applicationNumber !== "" && address !== "")
                await insertRow(database, {
                    applicationNumber: applicationNumber,
                    address: address,
                    description: ((description === "") ? "No description provided" : description),
                    informationUrl: url,
                    commentUrl: CommentUrl,
                    scrapeDate: moment().format("YYYY-MM-DD"),
                    receivedDate: receivedDate.isValid() ? receivedDate.format("YYYY-MM-DD") : ""
                });
        }
    }
}

main().then(() => console.log("Complete.")).catch(error => console.error(error));
