pragma solidity ^0.4.25;

import "../node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol";

contract FlightSuretyData {
    using SafeMath for uint256;

    /********************************************************************************************/
    /*                                       DATA VARIABLES                                     */
    /********************************************************************************************/

    address private contractOwner;                                      // Account used to deploy contract
    bool private operational = true;                                    // Blocks all state changes throughout the contract if false
    
    struct Airline {
        string name;
        bool isRegistered;
        bool providedFunds;
    }
    struct Insurance {
        address insureeAddress;
        uint256 amount;
        bool active;
    }
    mapping(string => Insurance[]) private insurances; // insurances per flight
    mapping(address => Airline) private airlines;
    uint256 private numRegisteredAirlines;
    mapping(address => address[]) private multiCalls;
    mapping(address => uint256) private insureeCredits;


    /********************************************************************************************/
    /*                                       EVENT DEFINITIONS                                  */
    /********************************************************************************************/


    /**
    * @dev Constructor
    *      The deploying account becomes contractOwner
    */
    constructor
                                (
                                    address firstAirline
                                ) 
                                public 
    {
        contractOwner = msg.sender;
        airlines[firstAirline] = Airline("first", true, false);
        numRegisteredAirlines = 1;
    }

    /********************************************************************************************/
    /*                                       FUNCTION MODIFIERS                                 */
    /********************************************************************************************/

    // Modifiers help avoid duplication of code. They are typically used to validate something
    // before a function is allowed to be executed.

    /**
    * @dev Modifier that requires the "operational" boolean variable to be "true"
    *      This is used on all state changing functions to pause the contract in 
    *      the event there is an issue that needs to be fixed
    */
    modifier requireIsOperational() 
    {
        require(operational, "Contract is currently not operational");
        _;  // All modifiers require an "_" which indicates where the function body will be added
    }

    /**
    * @dev Modifier that requires the "ContractOwner" account to be the function caller
    */
    modifier requireContractOwner()
    {
        require(msg.sender == contractOwner, "Caller is not contract owner");
        _;
    }

    modifier isRegisteredAirline()
    {
        require(airlines[msg.sender].isRegistered, "Caller is not a registered airline");
        _;
    }

    modifier isFundingAirline()
    {
        require(airlines[msg.sender].providedFunds, "Caller Airline haven't provided funds");
        _;
    }

    /********************************************************************************************/
    /*                                       UTILITY FUNCTIONS                                  */
    /********************************************************************************************/

    /**
    * @dev Get operating status of contract
    *
    * @return A bool that is the current operating status
    */
    function isOperational()
                            public
                            view
                            returns(bool)
    {
        return operational;
    }


    /**
    * @dev Sets contract operations on/off
    *
    * When operational mode is disabled, all write transactions except for this one will fail
    */    
    function setOperatingStatus
                            (
                                bool mode
                            ) 
                            external
                            requireContractOwner 
    {
        operational = mode;
    }

    /**
    * @dev Check if address is airline
    *
    * @return A bool represents if airline is registered
    */
    function isAirline(address airlineAddress)
                            public
                            view
                            returns(bool)
    {
        return airlines[airlineAddress].isRegistered;
    }

    /**
    * @dev Check if address is airline and provided funds
    *
    * @return A bool represents if airline provided funds
    */
    function isFundedAirline(address airlineAddress)
                            public
                            view
                            returns(bool)
    {
        return airlines[airlineAddress].providedFunds;
    }


    /********************************************************************************************/
    /*                                     SMART CONTRACT FUNCTIONS                             */
    /********************************************************************************************/

   /**
    * @dev Add an airline to the registration queue
    *      Can only be called from FlightSuretyApp contract
    *
    */   
    function registerAirline
                            (
                                address airlineAddress,
                                string name
                            )
                            external
                            requireIsOperational
                            isRegisteredAirline
                            isFundingAirline
    {
        require(!airlines[airlineAddress].isRegistered, "Airline is already registered");
        if (numRegisteredAirlines < 4) {
            airlines[airlineAddress] = Airline(name, true, false);
            numRegisteredAirlines = numRegisteredAirlines.add(1);
        } else {
            bool isDuplicate = false;
            for(uint c=0; c<multiCalls[airlineAddress].length; c++) {
                if (multiCalls[airlineAddress][c] == msg.sender) {
                    isDuplicate = true;
                    break;
                }
            }
            require(!isDuplicate, "Caller has already called this function.");

            multiCalls[airlineAddress].push(msg.sender);
            if (multiCalls[airlineAddress].length >= numRegisteredAirlines.div(2)) {
                airlines[airlineAddress] = Airline(name, true, false);
                numRegisteredAirlines = numRegisteredAirlines.add(1);
                multiCalls[airlineAddress] = new address[](0);
            }
        }
    }


   /**
    * @dev Buy insurance for a flight
    *
    */   
    function buy
                            (
                                string flight,
                                address airlineAddress                         
                            )
                            requireIsOperational
                            external
                            payable
    {
        require(msg.value <= 1 ether, "You need to send 1 ether max");
        uint256 amount = msg.value;
        airlineAddress.transfer(amount);
        insurances[flight].push(Insurance(msg.sender, msg.value, true));
    }

    /**
     *  @dev Credits payouts to insurees
    */
    function creditInsurees
                                (
                                    string flight
                                )
                                requireIsOperational
                                external
    {
        for (uint256 idx = 0; idx < insurances[flight].length; idx++) {
            if (insurances[flight][idx].active == true) { // safetyNet if loop fails before cleaning step afterwards
                address insureeAddress = insurances[flight][idx].insureeAddress;
                uint256 amountPut = insurances[flight][idx].amount;
                uint amountBonus = amountPut.div(2);
                uint256 refundAmound = amountPut + amountBonus;
                insurances[flight][idx].active = false;
                insureeCredits[insureeAddress] = insureeCredits[insureeAddress].add(refundAmound);
            }
        }
        delete insurances[flight];
    }
    

    /**
     *  @dev Transfers eligible payout funds to insuree
     *
    */
    function pay
                            (
                            )
                            external
                            requireIsOperational
    {
        require(insureeCredits[msg.sender] != 0, "Caller doesn't have any credits");
        uint amount = insureeCredits[msg.sender];
        insureeCredits[msg.sender] = 0;
        msg.sender.transfer(amount);
    }

   /**
    * @dev Initial funding for the insurance. Unless there are too many delayed flights
    *      resulting in insurance payouts, the contract should be self-sustaining
    *
    */   
    function fund
                            (   
                            )
                            public
                            payable
                            requireIsOperational
                            isRegisteredAirline
    {
        require(!airlines[msg.sender].providedFunds, 'Caller already provided funds');
        require(msg.value == 10 ether, 'You need to send exactly 10 ether to fund');
        airlines[msg.sender].providedFunds = true;
    }

    function getFlightKey
                        (
                            address airline,
                            string memory flight,
                            uint256 timestamp
                        )
                        pure
                        internal
                        returns(bytes32) 
    {
        return keccak256(abi.encodePacked(airline, flight, timestamp));
    }

    /**
    * @dev Fallback function for funding smart contract.
    *
    */
    function() 
                            external 
                            payable 
    {
        fund();
    }


}

