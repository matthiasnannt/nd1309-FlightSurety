import FlightSuretyApp from "../../build/contracts/FlightSuretyApp.json";
import Config from "./config.json";
import Web3 from "web3";
import express from "express";

let config = Config["localhost"];
let web3 = new Web3(
  new Web3.providers.WebsocketProvider(config.url.replace("http", "ws"))
);
web3.eth.defaultAccount = web3.eth.accounts[0];
let flightSuretyApp = new web3.eth.Contract(
  FlightSuretyApp.abi,
  config.appAddress
);

const oracles = {}; // index to accountIdx mapping

(async () => {
  const accounts = await web3.eth.getAccounts();
  const NUM_ORACLES = 25; // starting from account[4]

  // Iterate through NUM_ORACLES to register oracles
  for (let i = 0; i < NUM_ORACLES; i++) {
    const accountIdx = i + 4;
    // register oracle
    await flightSuretyApp.methods.registerOracle().send(
      {
        from: accounts[accountIdx],
        value: web3.utils.toWei("1", "ether"),
        gas: 6000000,
      },
      (error, result) => {
        console.log(
          `account[${accountIdx}]: registered oracle`,
          "errors: ",
          error
        );
      }
    );

    // get oracle indexes
    const indexes = await flightSuretyApp.methods.getMyIndexes().call(
      {
        from: accounts[accountIdx],
        gas: 6000000,
      },
      (error, result) => {
        console.log(
          `account[${accountIdx}]: requested indexes`,
          result,
          "errors: ",
          error
        );
      }
    );

    // map accountIdx to the indexes it is listening to
    for (const index of indexes) {
      if (!(index in oracles)) {
        oracles[index] = [accountIdx];
      } else {
        oracles[index].push(accountIdx);
      }
    }
  }

  //console.log("oracle mapping:", JSON.stringify(oracles, null, 2));
})();

flightSuretyApp.events.OracleRequest(
  {
    fromBlock: 0,
  },
  async function (error, event) {
    if (error) console.log(error);
    console.log(event);
    // handle oracle event
    const accounts = await web3.eth.getAccounts();
    const { index, airline, flight, timestamp } = event.returnValues;
    console.log("index:", index);
    console.log("matching oracle accountIdx:", oracles[index]);

    // respond with every oracle that matches the index
    for (const accountIdx of oracles[index]) {
      // choose a random status code from this list of possibilities
      const possibleStatusCodes = [0, 10, 20, 30, 40, 50];
      const statusCode =
        possibleStatusCodes[
          Math.floor(Math.random() * possibleStatusCodes.length)
        ];
      // send response for this oracle
      await flightSuretyApp.methods
        .submitOracleResponse(index, airline, flight, timestamp, statusCode)
        .call(
          {
            from: accounts[accountIdx],
          },
          (error, result) => {
            console.log(
              `account[${accountIdx}] send request response with statusCode ${statusCode}`,
              result,
              "errors: ",
              error
            );
          }
        );
    }
  }
);

const app = express();
app.get("/api", (req, res) => {
  res.send({
    message: "An API for use with your Dapp!",
  });
});

export default app;
