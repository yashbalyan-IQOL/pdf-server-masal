import moment from "moment";



const formatCost = (price) => {
    if(!price && price!==0) return;
    
    price = String(price);
    let isNegative = false;
  
    if (price < 0) {
      isNegative = true;
      price = Math.abs(price);
    }
  
    // Convert the price to a string and remove any existing commas
    let priceStr = price?.toString().replace(/,/g, "");
  
    // Split the number into integer and decimal parts
    let [integerPart, decimalPart] = priceStr.split(".");
  
    // Add commas for lakhs and crores
    let lastThree = integerPart.substring(integerPart.length - 3);
    let otherNumbers = integerPart.substring(0, integerPart.length - 3);
  
    if (otherNumbers !== "") {
      lastThree = "," + lastThree;
    }
  
    otherNumbers = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  
    // Combine the formatted integer part with decimal part (if exists)
    let formattedPrice = `₹${otherNumbers}${lastThree}`;
    if (decimalPart) {
      formattedPrice += `.${decimalPart}`;
    }
  
    if (isNegative) formattedPrice = `-${formattedPrice}`;
  
    return formattedPrice;
  }
// XIRR Calculation Function
function XIRR(values, dates, guess = 0.1) {
    // Calculates the resulting amount
    const irrResult = (values, dates, rate) => {
        const r = rate + 1;
        return values.reduce((acc, val, i) => acc + val / Math.pow(r, moment(dates[i]).diff(moment(dates[0]), 'days') / 365), values[0]);
    };

    // Calculates the first derivation
    const irrResultDeriv = (values, dates, rate) => {
        const r = rate + 1;
        return values.reduce((acc, val, i) => acc - ((moment(dates[i]).diff(moment(dates[0]), 'days') / 365) * val) / Math.pow(r, (moment(dates[i]).diff(moment(dates[0]), 'days') / 365) + 1), 0);
    };

    const positive = values.some(value => value > 0);
    const negative = values.some(value => value < 0);

    if (!positive || !negative) return '#NUM!';

    let resultRate = guess;
    const epsMax = 1e-10;
    const iterMax = 50;

    for (let i = 0; i < iterMax; i++) {
        const resultValue = irrResult(values, dates, resultRate);
        const newRate = resultRate - resultValue / irrResultDeriv(values, dates, resultRate);
        if (Math.abs(newRate - resultRate) <= epsMax && Math.abs(resultValue) <= epsMax) {
            return newRate;
        }
        resultRate = newRate;
    }

    return '#NUM!';
}

// IRR Calculation Function
function IRR(values, guess) {
    // Credits: algorithm inspired by Apache OpenOffice
    
    // Calculates the resulting amount
    var irrResult = function(values, dates, rate) {
      var r = rate + 1;
      var result = values[0];
      for (var i = 1; i < values.length; i++) {
        result += values[i] / Math.pow(r, (dates[i] - dates[0]) / 365);
      }
      return result;
    }
  
    // Calculates the first derivation
    var irrResultDeriv = function(values, dates, rate) {
      var r = rate + 1;
      var result = 0;
      for (var i = 1; i < values.length; i++) {
        var frac = (dates[i] - dates[0]) / 365;
        result -= frac * values[i] / Math.pow(r, frac + 1);
      }
      return result;
    }
  
    // Initialize dates and check that values contains at least one positive value and one negative value
    var dates = [];
    var positive = false;
    var negative = false;
    for (var i = 0; i < values.length; i++) {
      dates[i] = (i === 0) ? 0 : dates[i - 1] + 365;
      if (values[i] > 0) positive = true;
      if (values[i] < 0) negative = true;
    }
    
    // Return error if values does not contain at least one positive value and one negative value
    if (!positive || !negative) return '#NUM!';
  
    // Initialize guess and resultRate
    var guess = (typeof guess === 'undefined') ? 0.1 : guess;
    var resultRate = guess;
    
    // Set maximum epsilon for end of iteration
    var epsMax = 1e-10;
    
    // Set maximum number of iterations
    var iterMax = 50;
  
    // Implement Newton's method
    var newRate, epsRate, resultValue;
    var iteration = 0;
    var contLoop = true;
    do {
      resultValue = irrResult(values, dates, resultRate);
      newRate = resultRate - resultValue / irrResultDeriv(values, dates, resultRate);
      epsRate = Math.abs(newRate - resultRate);
      resultRate = newRate;
      contLoop = (epsRate > epsMax) && (Math.abs(resultValue) > epsMax);
    } while(contLoop && (++iteration < iterMax));
  
    if(contLoop) return '#NUM!';
  
    // Return internal rate of return
    return resultRate;
  }


  function calculateIRRMonthly(values, initialGuess = 0.05) {
    // Helper function to calculate IRR result
    const irrResult = (values, rate) => {
      const r = rate + 1;
      let result = values[0];
      for (let i = 1; i < values.length; i++) {
        const timeFraction = i / 12; // Monthly intervals in years
        result += values[i] / Math.pow(r, timeFraction);
      }
      return result;
    };
  
    // Helper function to calculate IRR derivative
    const irrResultDeriv = (values, rate) => {
      const r = rate + 1;
      let result = 0;
      for (let i = 1; i < values.length; i++) {
        const timeFraction = i / 12; // Monthly intervals in years
        result -= (timeFraction * values[i]) / Math.pow(r, timeFraction + 1);
      }
      return result;
    };
  
    // Ensure values contain at least one positive and one negative cash flow
    const hasPositive = values.some(v => v > 0);
    const hasNegative = values.some(v => v < 0);
    if (!hasPositive || !hasNegative) return "#NUM!";
  
    // Convergence settings
    let guess = initialGuess;
    const epsMax = 1e-8; // Relaxed precision
    const iterMax = 100; // Increased iteration limit
  
    let resultRate = guess;
    for (let iteration = 0; iteration < iterMax; iteration++) {
      const resultValue = irrResult(values, resultRate);
      const derivValue = irrResultDeriv(values, resultRate);
  
      if (Math.abs(derivValue) < epsMax) break; // Avoid division by zero
  
      const newRate = resultRate - resultValue / derivValue;
  
      if (Math.abs(newRate - resultRate) < epsMax) return newRate;
  
      resultRate = newRate;
    }
  
    // If no convergence, return error
    return "#NUM!";
  }


  function irrBisection(values, lowerBound = -1.0, upperBound = 1.0, tolerance = 1e-10, maxIterations = 1000) {
    // Helper function to calculate NPV at a given rate
    function npv(rate) {
        return values.reduce((acc, val, i) => acc + val / Math.pow(1 + rate, i), 0);
    }

    // Check if IRR is possible (values should contain at least one positive and one negative value)
    const positive = values.some(v => v > 0);
    const negative = values.some(v => v < 0);
    if (!positive || !negative) {
        return "#NUM!";
    }

    // Initialize midpoint and start iteration
    let iteration = 0;
    let midRate = (lowerBound + upperBound) / 2;

    while (iteration < maxIterations) {
        const npvMid = npv(midRate);

        // If NPV at midRate is close enough to zero, we found the IRR
        if (Math.abs(npvMid) < tolerance) {
            return midRate; // IRR found
        }

        // Narrow down the range based on the NPV result
        if (npvMid > 0) {
            lowerBound = midRate;
        } else {
            upperBound = midRate;
        }

        // Update midpoint for next iteration
        midRate = (lowerBound + upperBound) / 2;
        iteration++;
    }

    // If we reach maxIterations without finding IRR, return error
    return iteration === maxIterations ? "#NUM!" : midRate;
  }

  function calculateLoanDisbursement(quarters, totalLoanAmount, assetType) {
    const numQuarters = quarters.length;
    let disbursement = [];

    // Define distributions
    const apartmentDistributions = {
        4: [0.4, 0.3, 0.15, 0.15],
        3: [0.7, 0.15, 0.15],
        2: [0.85, 0.15],
        1: [1.0]
    };
    const plotDistributions = {
        2: [0.5, 0.5],
        1: [1.0]
    };

    // Determine applicable percentages based on assetType
    if (assetType === "plot") {
        if (numQuarters <= 4) {
            // Distribute 100% equally across all quarters
            const share = totalLoanAmount / numQuarters;
            disbursement = Array(numQuarters).fill(+(share.toFixed(2)));
        } else {
            // Distribute 50% in first 4 quarters and 50% in remaining quarters
            const firstHalf = totalLoanAmount * 0.5;
            const secondHalf = totalLoanAmount * 0.5;

            const firstQuarterShare = firstHalf / 4;
            const remainingQuarterShare = secondHalf / (numQuarters - 4);

            // First 4 quarters
            for (let i = 0; i < 4; i++) {
                disbursement.push(+(firstQuarterShare.toFixed(2)));
            }

            // Remaining quarters
            for (let i = 4; i < numQuarters; i++) {
                disbursement.push(+(remainingQuarterShare.toFixed(2)));
            }
        }
    } else if (assetType === "apartment") {
        let percentages;
        if (numQuarters >= 13) {
            percentages = apartmentDistributions[4];
        } else if (numQuarters >= 9) {
            percentages = apartmentDistributions[3];
        } else if (numQuarters >= 5) {
            percentages = apartmentDistributions[2];
        } else {
            percentages = apartmentDistributions[1];
        }

        const years = percentages.length;
        const quartersPerYear = Math.floor(numQuarters / years);
        const remainderQuarters = numQuarters % years;

        percentages.forEach((percentage, i) => {
            if (i < years - 1) {
                // Full years
                for (let j = 0; j < quartersPerYear; j++) {
                    disbursement.push(+(totalLoanAmount * (percentage / quartersPerYear)).toFixed(2));
                }
            } else {
                // Last year, distribute remaining quarters evenly
                const totalQuarters = quartersPerYear + remainderQuarters;
                for (let j = 0; j < totalQuarters; j++) {
                    disbursement.push(+(totalLoanAmount * (percentage / totalQuarters)).toFixed(2));
                }
            }
        });
    } else {
        throw new Error("Invalid assetType. Use 'plot' or 'apartment'.");
    }

    return disbursement;
}


export const createReport= (data)=>{
    try {
        let { acquisitionPrice, tenure, holdingPeriod, constructionCompletionDate, finalPrice, interestRate, loanPercentage, selectedCharge, assetType } = data;

// console.log({ acquisitionPrice, tenure, holdingPeriod, constructionCompletionDate, finalPrice, interestRate, loanPercentage, selectedCharge, assetType })
        if(!constructionCompletionDate)
        {
          constructionCompletionDate = "2026-12-31";
        }

        // current date
        const bookingDate = moment();
        
        // handover date
        let constructionDate = moment(constructionCompletionDate, "YYYY-MM-DD");

        // we will start disbursing loan amount 3 months after the current date 
        let quarterDate = moment(bookingDate).add(3, 'months');

        
        // if the construction date is before the quarter date then move construction date 1 year forward 
        if(constructionDate.isBefore(quarterDate)){
          constructionDate = quarterDate.clone().add(1, 'year');
        }
        

        const monthlyInterestRate = interestRate / 12 / 100;
        
        // booking amount will be 10 % 
        const bookingAmount = 0.10 * acquisitionPrice;

        // possession amount will be 5 % or less than 5 % 
        const possessionPercent = Math.min(5, 90-loanPercentage);
        const possessionAmount = (possessionPercent/100) * acquisitionPrice;

       const handoverPeriod = constructionDate.year()- bookingDate.year();

        
        // to check  
        // if the handover period is more than or equal to holding period then transfer fees (2%) otherwise stamp duty and registration charges (6.5%) will be applied 
        const transferOrStampRegCharges= (handoverPeriod>= holdingPeriod) ?  parseFloat(acquisitionPrice* 0.020)  : parseFloat(acquisitionPrice* 0.065);

        // variable for  tracking which charge is applied
        let transferOrStamp =  (handoverPeriod>= holdingPeriod) ? 0 : 1;
        
        // loan amount 
        const remainingLoanAmount = (loanPercentage/100) * acquisitionPrice;    // change
        
        // if the loan percentage is less than 85 percentrage then (85 - loan percentage) percentage amount will be paid to builder
        const AmountToBuilderPer =(Math.max(0, 85-loanPercentage)); 
        const AmountToBuilder = (AmountToBuilderPer/100) * acquisitionPrice;
        

        // cagr
       let cagr = (Math.pow(finalPrice / acquisitionPrice, 1 / holdingPeriod) - 1);


      //  getting all quarters on which the loan amount will be disursed 
        const quarters = [];
        while (quarterDate.isBefore(constructionDate)) {
            quarters.push(quarterDate.clone());
            quarterDate.add(3, 'months');
        }


        let maxQuartersLength;

        // for apartment, etc max holding period is 4 years 
        if(assetType==='apartment')
          maxQuartersLength = Math.min(16, quarters.length);


        // for plot max holding period is 2 years 
        if(assetType==='plot')
          maxQuartersLength = Math.min(8, quarters.length);
        

        // if quarters length is more than  the maxQuarters length then remove some quarters 
        while(quarters.length>maxQuartersLength)
          quarters.pop();


      //  getting all disbursement on all quarters 
       const disbursment =  calculateLoanDisbursement(quarters,remainingLoanAmount,assetType);        

        let loanAmount = 0;

        // monthy cashflow table
        let table = [];

        // yearly cashlows
        let cashflows = [];

        // variable for yearly emi sum 
        let yearlyEmiSum = 0;

        let currentDate = moment(bookingDate);

        // montly emis and cashlflow will be calculated for minimum of total tenure and holding period 
        let totalMonths = tenure * 12;
        let totalHoldingMonths= holdingPeriod * 12;
        
      let monthsPassed = 0;

      // variable for tracking loan amount disbursed till current date 
      let amtDisbursed=0;

      // variable for tracking amount paid to builder yearly 
      let yearlyBuilderAmt=0;

      // variable for tracking extra charges for monthly cashflow and yearly cashflow 
      let isExtraChargeAndPossessionConsiderForYearly=false;
      let isExtraChargeAndPossessionConsiderForMonthly=false;

      let currentQuarter=0;

        for (let i = 0; i < Math.min(totalMonths, totalHoldingMonths); i++) {   // change
            const isQuarter = quarters.some(quarter => quarter.isSame(currentDate, 'month'));
            if (isQuarter) {
                loanAmount += (disbursment[currentQuarter]);
                amtDisbursed += (disbursment[currentQuarter]);
                currentQuarter++;
            }

            let monthlyBuilderAmt=0;   // includes intial amount to builder (85- loan percentage (if less than 85)), possession amount, and loan amount not disbursed at last

            const openingLoanAmount = loanAmount;
            const interest = loanAmount * monthlyInterestRate;
            let emi = (loanAmount * monthlyInterestRate) / (1 - Math.pow(1 + monthlyInterestRate, - (tenure*12 - monthsPassed)));   // change
            const principal = emi - interest;
            const closingLoanAmount = loanAmount - emi + interest;
            
            let finalMonthlyCashflow= (emi)? (-emi) : 0;    // includes all cashflow (inflow and outflow): booking amt, possession amt, extra charges, loan repayment at sale, amt not disbursed till last and amount of sale
            let monthlyOthersCashFlow=0;  // includes all cashflow except emi: booking amt, possession amt, extra charges, loan repayment at sale, amt not disbursed till last and amount of sale
            const monthlyOthersCashFlowComponents= [];  // includes the components of cashflow

            // on booking date  
            if(currentDate.month() === bookingDate.month() && currentDate.year() === bookingDate.year()){
              finalMonthlyCashflow -= bookingAmount;
              monthlyOthersCashFlow+=bookingAmount;
              monthlyOthersCashFlowComponents.push(`down payment (-${formatCost(parseInt(bookingAmount))})`);
              if(AmountToBuilder){
                finalMonthlyCashflow -= AmountToBuilder;

                monthlyBuilderAmt+=AmountToBuilder;
                yearlyBuilderAmt+=AmountToBuilder;

                monthlyOthersCashFlow+=AmountToBuilder;
                monthlyOthersCashFlowComponents.push(`builder's remaining amount (-${formatCost(parseInt(AmountToBuilder))})`);
              }
            } 
            
            // on handoverMonth possessionAmount and extra charges will be paid
            if(currentDate.month() === constructionDate.month() && currentDate.year() === constructionDate.year()){
              finalMonthlyCashflow-=(possessionAmount+transferOrStampRegCharges);
              monthlyOthersCashFlow+=(possessionAmount+transferOrStampRegCharges);
              monthlyOthersCashFlowComponents.push(`possession amount (-${formatCost(parseInt(possessionAmount))})`);

              if(transferOrStamp===1)
              monthlyOthersCashFlowComponents.push(`stamp duty & registraion charges (-${formatCost(parseInt(transferOrStampRegCharges))})`);
              else 
              monthlyOthersCashFlowComponents.push(`transfer fees (-${formatCost(parseInt(transferOrStampRegCharges))})`);

              isExtraChargeAndPossessionConsiderForMonthly=true;

              // only possessionAmount will be paid to builder. extra charges (transferOrStampRegCharges) will be paid to goverment
              monthlyBuilderAmt+=(possessionAmount);
              yearlyBuilderAmt+=possessionAmount
            }

            // if handover month is after the holding period then possessionAmount and extra charges will be paid on last month
            if(!isExtraChargeAndPossessionConsiderForMonthly && i=== Math.min(totalMonths, totalHoldingMonths)-1){
              finalMonthlyCashflow-=(possessionAmount+transferOrStampRegCharges);
              monthlyOthersCashFlow+=(possessionAmount+transferOrStampRegCharges);
              monthlyOthersCashFlowComponents.push(`possession amount (-${formatCost(parseInt(possessionAmount))})`);

              if(transferOrStamp===1)
                monthlyOthersCashFlowComponents.push(`stamp duty & registraion charges (-${formatCost(parseInt(transferOrStampRegCharges))})`);
                else 
                monthlyOthersCashFlowComponents.push(`transfer fees (-${formatCost(parseInt(transferOrStampRegCharges))})`);   

              isExtraChargeAndPossessionConsiderForMonthly=true;

              monthlyBuilderAmt+=(possessionAmount);
              yearlyBuilderAmt+=possessionAmount
            }


            // on last month we will balance selling price (price of sale), remaining loan amount to be paid (disbursed) and loan amount that is not disbursed till last
            if(i=== Math.min(totalMonths, totalHoldingMonths)-1){
              // selling price
              finalMonthlyCashflow +=  finalPrice;

              // remaining loan amount to be paid at last
              finalMonthlyCashflow-= closingLoanAmount;

              // loan amount not disbursed till last 
              finalMonthlyCashflow -= parseInt(remainingLoanAmount - amtDisbursed);

              monthlyOthersCashFlow-= finalPrice;
              monthlyOthersCashFlow+= closingLoanAmount;
              monthlyOthersCashFlow+= parseInt(remainingLoanAmount - amtDisbursed);

              monthlyOthersCashFlowComponents.push(`selling price (+${formatCost(parseInt(finalPrice))})`);
              monthlyOthersCashFlowComponents.push(`loan repayment at sale (-${formatCost(parseInt(closingLoanAmount))})`);

              if(parseInt(remainingLoanAmount - amtDisbursed))
              monthlyOthersCashFlowComponents.push(`remaining loan disbursed amount (-${formatCost(parseInt(remainingLoanAmount - amtDisbursed))})`);

              monthlyBuilderAmt+= parseInt(remainingLoanAmount - amtDisbursed);
              yearlyBuilderAmt+= parseInt(remainingLoanAmount - amtDisbursed);
            }

            table.push([
                currentDate.format('MMMM YYYY'),
                openingLoanAmount.toFixed(2),
                {value:monthlyOthersCashFlow.toFixed(2), components:monthlyOthersCashFlowComponents},
                emi.toFixed(2),
                interest.toFixed(2),
                principal.toFixed(2),
                closingLoanAmount.toFixed(2),
                monthlyBuilderAmt.toFixed(2),
                finalMonthlyCashflow,
            ]);

            loanAmount = closingLoanAmount;
            yearlyEmiSum += emi;

            // Check if we need to record the yearly EMI sum
            if (currentDate.month() === 11) { // December
              cashflows.push(-(yearlyEmiSum + yearlyBuilderAmt)); 
              yearlyEmiSum = 0;
              yearlyBuilderAmt=0; 

              // check if possessionAmount and extra charges are not included in cashflow table 
              if(!isExtraChargeAndPossessionConsiderForYearly && currentDate.year() === constructionDate.year()){    
                cashflows[cashflows.length-1]-= (transferOrStampRegCharges);
                isExtraChargeAndPossessionConsiderForYearly=true;
              }
          }

            monthsPassed++;
            currentDate.add(1, 'month');
          }

        if (yearlyEmiSum > 0  || yearlyBuilderAmt> 0) {
            cashflows.push(-(yearlyEmiSum+ yearlyBuilderAmt));
        }        

        if (cashflows[cashflows.length - 1] != 0) {            
            cashflows[cashflows.length - 1] += (finalPrice - loanAmount);
        } else {
            cashflows[cashflows.length - 2] += (finalPrice - loanAmount);  
            cashflows.pop();
        }
        cashflows[0]-=(bookingAmount);
      
        if(!isExtraChargeAndPossessionConsiderForYearly){
          cashflows[cashflows.length-1]-= (transferOrStampRegCharges);
          isExtraChargeAndPossessionConsiderForYearly=true;
        }

        cashflows = cashflows.filter(val => !isNaN(val) && isFinite(val));

        // irr for yearly cashflow 
        let irr = IRR(cashflows);
        
        if(irr===Infinity || irr===0) 
        irr = irrBisection(cashflows);


        if (irr === '#NUM') throw new Error("At least one positive and one negative cashflow required");

        const monthly_cashflow= table.map((tab)=>tab[8]);
        // console.log(monthly_cashflow);

        // irr for monthly cashflow table 
        let irrForMonthlyCashflow = calculateIRRMonthly(monthly_cashflow);
        // console.log(irrForMonthlyCashflow)

        if(irrForMonthlyCashflow===Infinity || irrForMonthlyCashflow===0 || IRR === "NUM!")
          irrForMonthlyCashflow= null; 
        
       let totalIntrest;
       let totalPrinciple;

        
        totalIntrest = table.reduce((sum, currentArray) => {return sum + parseFloat(currentArray[4]);},0);
        totalPrinciple  = table.reduce((sum, currentArray) => {return sum + parseFloat(currentArray[5]);},0);


        let totalInvestment = parseInt(bookingAmount + totalIntrest + totalPrinciple); 

        
        // only stamp duty and registration charges will be included in total investment 
        if(holdingPeriod> handoverPeriod){
          totalInvestment+= transferOrStampRegCharges;
        }

        const totalReturns = finalPrice - acquisitionPrice - totalIntrest - transferOrStampRegCharges;  //change

        return {
          data:{
              irr: parseFloat((irr * 100).toFixed(2)),
              xirr:parseFloat((irrForMonthlyCashflow * 100).toFixed(2)),
              cashflows_yearly: cashflows,
              booking_amount: bookingAmount,
              possession_amount:possessionAmount,
              charges_value: transferOrStampRegCharges,
              amount_not_disbursed: Math.max(0,remainingLoanAmount - amtDisbursed), 
              total_investment: totalInvestment,
              total_returns : totalReturns,
              loan_balance: Math.ceil(loanAmount),
              cagr:cagr,
              constructionCompletionDate:constructionDate.format("YYYY-MM-DD"),
              equity_multiplier: parseFloat(((totalInvestment + totalReturns) / totalInvestment).toFixed(2)),
              monthly_cf: table
          }
        };
    } catch (error) {
        return { error: error.toString() };
    }
}