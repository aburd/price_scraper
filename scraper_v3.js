'use strict';

var Promise = require('bluebird'),
    request = Promise.promisifyAll(require('request')),
    cheerio = require('cheerio'),
    fs      = require('fs'),
    path    = require('path');

var prices      = [],
    links       = [],
    floorNames  = [],
    locCounter  = 0;

// Date stuff
var theDate       = new Date(),
    currentYear   = theDate.getFullYear().toString(),
    currentMonth  = (theDate.getMonth() + 1).toString(),
    dateString    = theDate.toDateString().replace(/\s/g, '-')
// EN of JP links
var linkEn = 'http://www.en.regus.co.jp/virtual-office/japan/';
// Directory to put new files
var pathToCurrentMonthFolder = path.join(__dirname, 'price-keeping', currentYear, currentMonth);
// MAKE FILE AND CREATE COLUMNS
var writable = fs.createWriteStream(path.join(pathToCurrentMonthFolder, 'res-'+dateString+'.csv'));
var regusPricesWriteStream = fs.createWriteStream(path.join(pathToCurrentMonthFolder, 'res-'+dateString+'.json') );
writable.write(`Location Name;URL;Mailbox Plus;Telephone Answering;Virtual Office;Virtual Office Plus\n`)

var regusLocations = {};

function Location() {
  this.name = '';
  this.url = '';
  this.prices = {};
}

var mail = [],
  phone = [],
  virtual = [],
  virtualPlus = [];

var cities = ['Tokyo', 'Yokohama', 'Chiba', 'Ibaraki', 'Fukuoka', 'Hiroshima', 'Osaka', 'Nagoya', 'Sendai', 'Okayama', 'Kobe', 'Kagawa', 'Kyoto', 'Sapparo', 'Aomori', 'Kagoshima', 'Okinawa'];

// this function scrapes the regus tokyo website for names and link information
function getCityLinks(city) {
  return new Promise((resolve, reject) => {
    var cityLocations = [];
    // retrieve the body HTML document
    request(linkEn + city, function(error, response, body) {

      if (!error && response.statusCode == 200) {

        var $ = cheerio.load(body);
        var actual = parseInt($('.results-count').text());

        // load links into an array
        $('.results_cols_wrapper').each(function(i, a) {
          var loc = new Location();

          // GENERAL LOCATION INFORMATION
          loc.url = 'http://www.regus.co.jp' + $(a).find('.more-info-link').attr('href');
          loc.name = $(a).find('.centre-name').text().replace(/\s{2,}/g, '').replace(',', '');

          // PUSH THE SPECIFIC PRODUCTS TO THE LOCATION INFORMATION
          $(this).find('.vo_products').each(function(i, product) {
            var productName = $(product).find('p').text().trim();
            var amount = $(product).find('h3').text().match(/¥.*/)[0];
            loc.prices[productName] = amount;
          });

          cityLocations.push(loc);
          locCounter += 1;
        });

        // regusLocations[city] = cityLocations;

        resolve(cityLocations);

      } else {
        reject(error)
      }
    });

  })
}

var cityPromises = [];

// Push all promises to an array for iteration
console.info('Gathering links for analysis...');
cities.forEach((city) => {
  cityPromises.push(getCityLinks(city));
});
// Map all locations in order
Promise.mapSeries(cityPromises, function(cityArray, i){
  console.log('Starting ' + i)
  writeLocationsToFile(cityArray)

})
.then(() => { //Print results

  console.log(`All done with data for ${locCounter} locations logged.`);

  function avgPrice(arr) {
    var total = arr.reduce((a, b) => {
      return a + b;
    });
    return total / arr.length;
  }

  console.log(`Average Mail: ${avgPrice(mail)}\nAverage Phone: ${avgPrice(phone)}\nAverage Virtual: ${avgPrice(virtual)}\nAverage Virtual Plus: ${avgPrice(virtualPlus)}`)

})

function writeLocationsToFile(cityArr){
  // ORGANIZE LOCATIONS INSIDE OF CITIES
  function compare(a, b) {
    if (a.name > b.name) {
      return 1;
    } else if (b.name > a.name) {
      return -1;
    } else {
      return 0;
    }
  }
  cityArr.sort(compare);

  // WRITE RESULTS TO STREAM
  regusPricesWriteStream.write(JSON.stringify(cityArr))
  cityArr.forEach(function(locationObj) {
    locationObj.prices['Mailbox Plus'] = locationObj.prices['Mailbox Plus'] || 'n/a';
    locationObj.prices['Telephone Answering'] = locationObj.prices['Telephone Answering'] || 'n/a';
    locationObj.prices['Virtual Office'] = locationObj.prices['Virtual Office'] || 'n/a';
    locationObj.prices['Virtual Office Plus'] = locationObj.prices['Virtual Office Plus'] || 'n/a';

    function addTo(arr, val) {
      if (val !== 'n/a') {
        val = parseInt(val.replace(/¥|,/g, ''));
        arr.push(val);
      }
    }
    addTo(mail, locationObj.prices['Mailbox Plus']);
    addTo(phone, locationObj.prices['Telephone Answering']);
    addTo(virtual, locationObj.prices['Virtual Office']);
    addTo(virtualPlus, locationObj.prices['Virtual Office Plus']);

    writable.write(`${locationObj.name};${locationObj.url};${locationObj.prices['Mailbox Plus']};${locationObj.prices['Telephone Answering']};${locationObj.prices['Virtual Office']};${locationObj.prices['Virtual Office Plus']}\n`);
    console.log(`Data written for ${locationObj.name}.`)
  });

}

