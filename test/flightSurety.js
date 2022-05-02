var Test = require("../config/testConfig.js");
var BigNumber = require("bignumber.js");
var web3 = require("web3");

contract("Flight Surety Tests", async (accounts) => {
  var config;

  let airline2 = accounts[2];
  let airline3 = accounts[3];
  let airline4 = accounts[4];
  let airline5 = accounts[5];

  before("setup contract", async () => {
    config = await Test.Config(accounts);
    await config.flightSuretyData.authorizeCaller(
      config.flightSuretyApp.address
    );
  });

  /****************************************************************************************/
  /* Operations and Settings                                                              */
  /****************************************************************************************/

  it(`(multiparty) has correct initial isOperational() value`, async function () {
    // Get operating status
    let status = await config.flightSuretyData.isOperational.call();
    assert.equal(status, true, "Incorrect initial operating status value");
  });

  it(`(multiparty) can block access to setOperatingStatus() for non-Contract Owner account`, async function () {
    // Ensure that access is denied for non-Contract Owner account
    let accessDenied = false;
    try {
      await config.flightSuretyData.setOperatingStatus(false, {
        from: config.testAddresses[2],
      });
    } catch (e) {
      accessDenied = true;
    }
    assert.equal(accessDenied, true, "Access not restricted to Contract Owner");
  });

  it(`(multiparty) can allow access to setOperatingStatus() for Contract Owner account`, async function () {
    // Ensure that access is allowed for Contract Owner account
    let accessDenied = false;
    try {
      await config.flightSuretyData.setOperatingStatus(false);
    } catch (e) {
      accessDenied = true;
    }
    assert.equal(
      accessDenied,
      false,
      "Access not restricted to Contract Owner"
    );
  });

  it(`(multiparty) can block access to functions using requireIsOperational when operating status is false`, async function () {
    await config.flightSuretyData.setOperatingStatus(false);

    let reverted = false;
    try {
      await config.flightSurety.setTestingMode(true);
    } catch (e) {
      reverted = true;
    }
    assert.equal(reverted, true, "Access not blocked for requireIsOperational");

    // Set it back for other tests to work
    await config.flightSuretyData.setOperatingStatus(true);
  });

  it("(airline) cannot register an Airline using registerAirline() if it is not funded", async () => {
    // ARRANGE
    let newAirline = accounts[2];

    // ACT
    try {
      await config.flightSuretyApp.registerAirline(newAirline, {
        from: config.firstAirline,
      });
    } catch (e) {}
    let result = await config.flightSuretyData.isAirline.call(newAirline);

    // ASSERT
    assert.equal(
      result,
      false,
      "Airline should not be able to register another airline if it hasn't provided funding"
    );
  });

  it("fund first airline", async () => {
    let notFundedAirline = await config.flightSuretyData.isFundedAirline(
      config.firstAirline
    );

    assert.equal(notFundedAirline, false, "Airline is already funded");

    await config.flightSuretyData.fund({
      from: config.firstAirline,
      value: web3.utils.toWei("10", "ether"),
    });

    let fundedAirline = await config.flightSuretyData.isFundedAirline(
      config.firstAirline
    );

    assert.equal(fundedAirline, true, "Airline isn't funded");
  });

  it("multi-party consensus registration", async () => {
    // register & fund airline2
    await config.flightSuretyData.registerAirline(airline2, true, {
      from: config.firstAirline,
    });
    await config.flightSuretyData.fund({
      from: airline2,
      value: web3.utils.toWei("10", "ether"),
    });
    // register & fund airline3
    await config.flightSuretyData.registerAirline(airline3, true, {
      from: config.firstAirline,
    });
    await config.flightSuretyData.fund({
      from: airline3,
      value: web3.utils.toWei("10", "ether"),
    });
    // register & fund airline4
    await config.flightSuretyData.registerAirline(airline4, true, {
      from: config.firstAirline,
    });
    await config.flightSuretyData.fund({
      from: airline4,
      value: web3.utils.toWei("10", "ether"),
    });

    // register 5th airline: should only be possible with multi party consensus
    await config.flightSuretyData.registerAirline(airline5, true, {
      from: config.firstAirline,
    });

    let registeredAirlineAttempt = await config.flightSuretyData.isAirline(
      airline5
    );

    assert.equal(
      registeredAirlineAttempt,
      false,
      "Multi-party call failed: registered on first attempt"
    );

    // let one other airline vote (-> 50%):
    await config.flightSuretyData.registerAirline(airline5, true, {
      from: airline2,
    });

    let registeredAirline = await config.flightSuretyData.isAirline(airline5);

    // ASSERT
    assert.equal(
      registeredAirline,
      true,
      "Multi-party call failed: airline not registered after 50% votes"
    );
  });
});
