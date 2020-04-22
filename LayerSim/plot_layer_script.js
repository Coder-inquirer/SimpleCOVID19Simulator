/*
Use stages_v2.json for this version
  Block
  |
  |>Layer
    |
    |>N
    |>susc
    |>S (Remember: 'S' is not a stage)
    |>stagesCount (Json object)
      |
      |>StageName (e.g. E,I,Q,R,Asym etc.)

*/

// PARAMETERS __________________________
const N_HISTORY_DAYS = 14;
const T_STEP = 1;
let BETA = 0.6172;

// GLOBAL VARIABLES ____________________

let myLayers = [];
let myBlocks = [];
let adj=[];

let xData=[];
let ySData=[];
let yIData=[];
let yRData=[];

let globalStageData=null;
let globalStages=null;
let globalStage_fractions_by_days=null;
let globalStagesCount = null;
let globalStagesQuarantineFraction = null;
let globalStagesInfectiousness = null;
let globalStagesQuarantineFractionLockdown=null;
let wards,layersData;

let steps=[];
let config=[];

let progress = document.getElementById('myProgressBar');
let triggering = true;
let lockdownOnTrigger = 1000;
let lockdownOffTrigger = 50;
let lockdownImposed=false;
let nDays = 120;

let mySIRChart=null,mySChart=null,myIChart=null,myRChart=null,myProgressionChart=null;
let triggeringCheckbox = document.getElementById('triggeringCheckbox');
let triggerOnDisplay   = document.getElementById('triggerOnDisplay');
let triggerOffDisplay  = document.getElementById('triggerOffDisplay');
let nDaysDisplay       = document.getElementById('nDaysDisplay');
let betaDisplay        = document.getElementById('betaDisplay');
let myLogo = document.getElementById('myLogo');
let runOnce=false;

nDaysDisplay.value = nDays;
betaDisplay.value=BETA;
triggerOffDisplay.value=lockdownOffTrigger;
triggerOnDisplay.value=lockdownOnTrigger;


//triggering = triggeringCheckbox.value;

// CLASSES _____________________________

class Layer{
  
  constructor(N=100,susc=0.62,E=0.0,stages=globalStagesCount){
    this.N=Math.floor(N);
    this.susc=susc;
    this.S = Math.floor(clone(this.N))||0;
    this.R = 0;
    this.stages=clone(stages);
    for(let stageName in this.stages){
      this.stages[stageName]=0.0;
    }
    this.historyDays=[0,0,0,0,0,0,0,0,0,0,0,0,0,0];
    this.infectiousness=1;
    this.exposeFew(E);
  }
  
  updateExpose(force){
    let newExposed = (force*this.susc*this.S);
    newExposed = Math.min(newExposed,this.S);
    this.historyPush(newExposed);
  }
  
  historyPush(newExposed) {
    for(let stageName in this.stages){
      this.stages[stageName]=0;
    }
    
    let popped=this.historyDays.pop(); //Pop the last element from historyDays
    
    let pushed = newExposed;
    this.S -= pushed;
    this.historyDays.unshift(pushed);  //Push a new element into historyDays
    
    for(let i in this.historyDays){
      for(let stageName in this.stages){
        this.stages[stageName] += this.historyDays[i] * globalStage_fractions_by_days[stageName][i];
      }
    }
    
    let sum=0;
    for (let stageName in this.stages){
      sum += parseFloat(this.stages[stageName]);
    }
    
    this.stages.R = this.N - this.S - sum + parseFloat(this.stages['R']);
    this.R = parseFloat(this.stages.R);
    
    let inf=0;
    for(let stageName in this.stages){
      inf += this.stages[stageName] * globalStagesInfectiousness[stageName] * (1.0-globalStagesQuarantineFraction[stageName]);
    }
    this.infectiousness=inf;
  }
  
  update() { //legacy function, deprecated
    for(let stageName in this.stages){
      this.stages[stageName]=0;
    }
    
    let popped=this.historyDays.pop(); //Pop the last element from historyDays
    //this.stages.R.count+=popped;
    
    let pushed = this.susc * this.S * this.activation;
    this.S -= pushed;
    this.historyDays.unshift(pushed);  //Push a new element into historyDays
    
    for(let i in this.historyDays){
      for(let stageName in this.stages){
        this.stages[stageName] += this.historyDays[i] * globalStage_fractions_by_days[stageName][i];
      }
    }
    
    let sum=0;
    for (let stageName in this.stages){
      sum += parseFloat(this.stages[stageName]);
    }
    
    this.stages.R = this.N - this.S - sum + parseFloat(this.stages["R"]);
    //console.log(this.N,this.S,sum-this.stages.R.count,this.stages.R.count);
    
    let inf=0;
    for(let stageName in this.stages){
      inf += this.stages[stageName] * globalStagesInfectiousness[stageName] * (1.0-globalStagesQuarantineFraction[stageName]);
    }
    this.infectiousness=inf;
  }
  
  exposeFew(newExposed){
    //this.stages['E'] += newExposed;
    this.S -= newExposed;
    this.historyPush(newExposed);
  }
}


class Block{
  
  constructor(myLayers=[],id="None",stages=globalStagesCount){
    this.blockLayers = myLayers;
    this.id=id;
    this.N=0;
    this.S=0;
    this.I=0;
    this.R=0;
    this.activation  = 0;
    this.infectiousness=0;
    this.stages = clone(stages);
    this.calibrateUpwards();
  }
  
  calibrateUpwards(){
    this.N=0;
    this.S=0;
    this.I=0;
    this.R=0;
    this.infectiousness=0;
    this.stages=clone(globalStagesCount);
    for(let i in this.blockLayers){
      this.N += this.blockLayers[i].N;
      this.S += this.blockLayers[i].S;
      this.R += this.blockLayers[i].R;
      this.infectiousness+=parseFloat(this.blockLayers[i].infectiousness);
      for (let stageName in this.stages){
        this.stages[stageName] += this.blockLayers[i].stages[stageName];
      }
    }
    this.I = this.N - this.S - this.R;
  }
  
  updateExpose(force){
    for (let index in this.blockLayers){
      this.blockLayers[index].updateExpose(force);
    }
    this.calibrateUpwards();
  }
  
  exposeFew(newExposed){
    this.blockLayers[0].exposeFew(newExposed);
    this.calibrateUpwards();
  }
  
}


async function getWardData(){
  let wards=[];
  const response = await fetch('https://raw.githubusercontent.com/Coder-inquirer/SimpleCOVID19Simulator/master/LayerSim/delhi_lat_lon_popl.csv');
  const data = await response.text();
  //console.log(data);
  const rows = data.split('\n').slice(1);
  rows.forEach(elt=>{
    const row = elt.split(',');
    const id = row[0];
    const lon=row[1];
    const lat=row[2];
    const popl=row[3];
    //console.log(id,lon,lat,popl);
    wards.push(clone({"id":id,"lon":lon,"lat":lat,"popl":popl}));
  });
  return wards;
}

async function getLayerData(){
  let myLayers=[];
  const response = await fetch('https://raw.githubusercontent.com/Coder-inquirer/SimpleCOVID19Simulator/master/LayerSim/vulnerability_delhi.csv');
  const data = await response.text();
  
  const rows = data.split('\n').slice(1);
  rows.forEach(elt=>{
    const row = elt.split(',');    
    myLayers.push(clone({"vulnerability":row[0],"fraction":row[1] } ));
  });
  return myLayers;
}

function createNewBlock(N,id,layersData){
  let myLayers=[];
  for(let i=0; i<layersData.length-1; i++){
    if(layersData[i]!=null){
      let myLayer = new Layer(Math.floor(layersData[i].fraction*N),
                              BETA/0.45*layersData[i].vulnerability);
      myLayers.push(myLayer);
    }
  }
  let myBlock=new Block(myLayers,id);
  return myBlock;
}

async function initialize(loadData=true){
  progress.value=0.1;
  if (loadData==true){
    wards = await getWardData();
    progress.value=0.3;
    layersData = await getLayerData();
    progress.value=0.4;
    console.log("gotLayer");
    globalStageData = await getStageData();
    console.log("gotStage");
  }
  progress.value=0.7;
  globalStages = globalStageData.stages;
  globalStage_fractions_by_days = globalStageData.stage_fractions_by_days;
  globalStagesCount = clone(globalStageData.stagesCount);
  globalStagesQuarantineFraction = clone(globalStageData.stagesQuarantineFraction);
  globalStagesQuarantineFractionLockdown = clone(globalStageData.stagesQuarantineFractionLockdown);
  globalStagesInfectiousness = clone(globalStageData.stagesInfectiousness);
  
  
  myLayers = [];
  myBlocks = [];
  adj=[];
  
  for(let i=0; i<wards.length-1; i++){
    //progress.value=(i+1)/wards.length;
    if(wards[i]!=null){
      //let myBlock=createNewBlock(parseFloat(wards[i]['popl']),layersData);
      myBlocks.push(createNewBlock(parseFloat(wards[i]['popl']),id=wards[i]['id'],layersData));
    }
    
    adj.push([]);
    for(let j=0; j<wards.length-1; j++){
      if (i==j){
        adj[i].push(1);
      }
      else{
        dist = haversine(wards[i]['lon'],wards[i]['lat'],wards[j]['lon'],wards[j]['lat']);
        if (dist<10)
          adj[i].push(1/dist/100);
        else
          adj[i].push(0);
      }
    }
  }
  progress.value=0.6;
  
  xData=[];
  ySData=[];
  yIData=[];
  yRData=[];
}

async function simulate(loadData=true,wannaInitialize=true){
  let t_0=0;
  if (wannaInitialize==true){
    await initialize(loadData);
    t_0=0;
  }
  else{
    t_0 = 1+xData[xData.length-1];
  }

  myBlocks[0].exposeFew(1);
  
  
  for(let i=0; i<nDays; i++){
    //console.log(i+t_0);
    progress.value=(i)/nDays;
    let yS=0;
    let yI=0;
    let yR=0;
    
    for (let j in myBlocks){
      myBlocks[j].activation=0;
      for (k in myBlocks){
        //myBlocks[j].activation += parseFloat(myBlocks[k].I/myBlocks[k].N) * adj[j][k];
        myBlocks[j].activation += myBlocks[k].infectiousness/myBlocks[k].N * adj[j][k];
      }
    }
    
    //let j=0;
    for (let j in myBlocks){
      myBlocks[j].updateExpose(myBlocks[j].activation);
      yS+=myBlocks[j].S;
      yI+=myBlocks[j].N-myBlocks[j].S-myBlocks[j].R;
      yR+=myBlocks[j].R;
    }
    
    if (triggering==true){
      if (lockdownImposed==false && yI>lockdownOnTrigger){
        lockdownImposed=true; 
        globalStagesQuarantineFraction = clone(globalStageData.stagesQuarantineFractionLockdown);
      }
      else if(lockdownImposed==true && yI<=lockdownOffTrigger){
        lockdownImposed=false;
        globalStagesQuarantineFraction = clone(globalStageData.stagesQuarantineFraction);
      }
    }
    xData.push(i+t_0);
    ySData.push(yS);
    yIData.push(yI);
    yRData.push(yR);
  }
  
  //const colors=['blue','red','green'];
  const colors=['#536DFE',
                '#FF5722',
                '#8BC34A'
                ]; 
  const bgColors=['rgba(0,0,255,0.5)',
                  'rgba(255,0,0,0.5)',
                  'rgba(0,255,0,0.5)'
                 ];
                 
  let xlabel = "Days";
  let ylabel = "Number of people";
  chartIt(mySIRChart,'myChart',xData,[ySData,yIData,yRData],["S","I","R"],colors,bgColors,xlabel,ylabel,'SIR Simulation',true,false,'logarithmic');
  chartIt(mySIRChart,'myChartLinear',xData,[ySData,yIData,yRData],["S","I","R"],colors,bgColors,xlabel,ylabel,'SIR Simulation',true,false,'linear');
  chartIt(mySChart,'mySChart',xData,[ySData],["S"],[colors[0]],[bgColors[0]],xlabel,ylabel,'Susceptible');
  chartIt(myIChart,'myIChart',xData,[yIData],["I"],[colors[1]],[bgColors[1]],xlabel,ylabel,'Infectious');
  chartIt(myRChart,'myRChart',xData,[yRData],["R"],[colors[2]],[bgColors[2]],xlabel,ylabel,'Recovered');
  progress.style="width:0%";    //QUICK AND DIRTY
  console.log(myBlocks[0]);
  
  let rerunBtn = document.getElementById("rerun");
  rerunBtn.style.display = "inline";
  myLogo = document.getElementById('myLogo');
  myLogo.innerHTML = "EPIDEMULATOR";
}

async function chartIt(myChart,chartId,xData,yData,labels,colors,bgColors,xlabel,ylabel,title,legendDisplay=false,stacked=false,yType='linear'){ // data format:  xData=[x1,x2,...], yData=[[y11,y12,...],[y21,y22,...],...], labels=[l1,l2,...]
  
  let canvas = document.getElementById(chartId);
  let ctx = document.getElementById(chartId).getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  
  Chart.defaults.global.elements.line.borderWidth = 10;
  //Chart.defaults.global.elements.point.backgroundColor = 'rgba(0, 0, 0, 0.1)';
  
  datasets=[];
  for (index in yData){
    dataset = {
        label: labels[index],
        data: yData[index],
        fill: stacked,
        borderColor:colors[index],
        backgroundColor:bgColors[index],
        borderWidth: 1
      };
    datasets.push(dataset);
  }
  
  myChart=null;
  
  myChart = new Chart(ctx, {
    type: 'line',
    data: {
          labels: xData,
          datasets: datasets
          },
      options: {
          legend:{
            display: legendDisplay
          },
          responsive: true,
          //maintainAspectRatio: false,
          title: {
              display: true,
              text: title
          },
          scales: {
              yAxes: [{
                  type: yType,
                  stacked: stacked,
                  scaleLabel:{
                      display: true,
                      labelString: ylabel
                  }
              }],
              xAxes: [{
                  scaleLabel:{
                      display: true,
                      labelString: xlabel
                  }
              }]
          }
      }
  });
}

async function plotParams(){
  fraction = await getStagesFractionChartData();
  xData = fraction.xData;
  yData = fraction.yData;
  labels = fraction.labels;
  const colors=['blue','yellow','red','green'];
  const bgColors=['blue','yellow','red','green'];
  let xlabel = "Days since exposure";
  let ylabel = "Fraction of people in the stage";
  chartIt(myProgressionChart,'myProgressionChart',xData,yData,labels,colors,bgColors,xlabel,ylabel,'Stage Progression Parameters',true,true);
}

async function plotInfectiousnessEtc(){
  globalStageData = await getStageData();
  globalStagesInfectiousness = globalStageData.stagesInfectiousness;
  xData = [];
  yIData = [];
  yQData = [];
  yQLData = [];
  for (let stageName in globalStageData.stagesInfectiousness){
    xData.push(stageName);
    yIData.push(parseFloat(globalStageData.stagesInfectiousness[stageName]));
    yQLData.push(parseFloat(globalStageData.stagesQuarantineFractionLockdown[stageName]));
    yQData.push(parseFloat(globalStageData.stagesQuarantineFraction[stageName]));
  }
  const colors=['blue','yellow','red','green'];
  const bgColors=['blue','yellow','red','green'];
  let xlabel = "Stages";
  barChart("myInfectiousnessChart",xData,yIData,colors,bgColors,xlabel,"Infectiousness","Infectiousness of stages");
  barChart("myQuarantineChart",xData,yQData,colors,bgColors,xlabel,"Percent isolation","Isolation practiced by stages");
  barChart("myQuarantineLockdownChart",xData,yQLData,colors,bgColors,xlabel,"Percent isolation","Isolation practiced by stages during Lockdown");
}

async function barChart(chartId,xData,yData,colors,bgColors,xlabel,ylabel,title){
  let ctx = document.getElementById(chartId).getContext('2d');
  
  let myBarChart = new Chart(ctx, {
    type: 'bar',
    data: {
          labels: xData,
          datasets: [{
              data: yData,
              borderColor:colors,
              backgroundColor:bgColors,
              borderWidth: 1
            }]
          },
      options: {
          legend:{
            display: false
          },
          responsive: true,
          maintainAspectRatio: false,
          title: {
              display: true,
              text: title
          },
          scales: {
              yAxes: [{
                  scaleLabel:{
                      display: true,
                      labelString: ylabel
                  },
                  ticks:{
                    max:1,
                    min:0,
                    autoSkip:true,
                    autoSkipPadding:1
                  }
              }],
              xAxes: [{
                  scaleLabel:{
                      display: true,
                      labelString: xlabel
                  }
              }]
          }
      }
  });
}

async function getStagesFractionChartData(){
  const xData=[1,2,3,4,5,6,7,8,9,10,11,12,13,14];
  const yData=[];
  const labels=[];
  let responseJson = await getStageData();
  let stage_fractions_by_days=responseJson["stage_fractions_by_days"];
  //console.log(responseJson)
  console.log("getting fraction data");
  for (stage_name in stage_fractions_by_days){
    yData.push(stage_fractions_by_days[stage_name]);
    labels.push(stage_name);
  }
  
  return {xData,yData,labels};
}

async function getStageData(){
  console.log("getting stage data");
  let stages,stage_fractions_by_days,responseJson;
  
  const jsonURL = 'https://raw.githubusercontent.com/Coder-inquirer/SimpleCOVID19Simulator/master/LayerSim/stages_v2_1.json';
  try {
    let response = await fetch(jsonURL);
    responseJson = await response.json();
  } catch(error) {
    console.error(error);
  }
  console.log(responseJson);
  return responseJson;
}

function clone(obj){ 
  return JSON.parse(JSON.stringify(obj));
} 

function toRad(Value) {
    /** Converts numeric degrees to radians */
    return Value * Math.PI / 180;
}

function haversine(lon1,lat1,lon2,lat2){
  let R = 6371; // kilometres
  let phi1 = toRad(lat1);
  let phi2 = toRad(lat2);
  let dphi = toRad(lat2-lat1);
  let dlambda = toRad(lon2-lon1);

  let a = Math.sin(dphi/2) * Math.sin(dphi/2) +
          Math.cos(phi1) * Math.cos(phi2) *
          Math.sin(dlambda/2) * Math.sin(dlambda/2);
  let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

function triggeringChanged(){
  triggering = triggeringCheckbox.checked;
}

function triggerOnChanged(){
  lockdownOnTrigger = parseInt(triggerOnDisplay.value);
}

function triggerOffChanged(){
  lockdownOffTrigger = parseInt(triggerOffDisplay.value);
}

function nDaysChanged(){
  nDays = parseInt(nDaysDisplay.value);
}

function betaChanged(){
  BETA = parseInt(betaDisplay.value);
}

async function addStep(){
  steps.push(clone({
    'nDays':nDays,
    'BETA' :BETA,
    'triggering':triggering,
    'lockdownOnTrigger':lockdownOnTrigger,
    'lockdownOffTrigger':lockdownOffTrigger
  }));
}

async function continueRun(){
  await simulate(false,false);
  await addStep();
} 

async function run(){
  console.log('First run started');
  progress.value=0;
  progress.style="width:100%";    //QUICK AND DIRTY
  let myLogo = document.getElementById('myLogo');
  myLogo.innerHTML = "EPIDEMULATOR  Loading...";
  await simulate(!runOnce);
  runOnce=true;
  progress.value=1.0;
  progress.style="width:0%";    //QUICK AND DIRTY
  myLogo.innerHTML = "EPIDEMULATOR";
  document.getElementById("cardChart").style.display = "block";
  await addStep();
} 

async function saveJSON(saveStepsId="saveSteps"){
  document.getElementById(saveStepsId).value = JSON.stringify(steps);
}

async function loadJSON(loadStepsId="loadSteps"){
  console.log("loadSteps");
  let loadedSteps=JSON.parse(document.getElementById(loadStepsId).value);
  console.log(loadedSteps);
  
  for (let i=0; i<loadedSteps.length; i++){
    console.log(i);
    nDays=clone(loadedSteps[i]['nDays']);
    BETA=clone(loadedSteps[i]['BETA']);
    triggering=clone(loadedSteps[i]['triggering']);
    lockdownOnTrigger=clone(loadedSteps[i]['lockdownOnTrigger']);
    lockdownOffTrigger=clone(loadedSteps[i]['lockdownOffTrigger']);
    if (i==0)
      await run();
    else
      await continueRun();
  }
  
}

async function copyToClipboard(elementId){
  var copyText = document.getElementById(elementId);
  copyText.select();
  copyText.setSelectionRange(0, 99999)
  document.execCommand("copy");
}

plotParams();
plotInfectiousnessEtc();
//plotQuarantineFraction();
///////////////////////////////////////////////////////////////// EXTERNAL /////////////////////////////////////
/*
// some data to be plotted
var x_data = [1500,1600,1700,1750,1800,1850,1900,1950,1999,2050];
var y_data_1 = [86,114,106,106,107,111,133,221,783,2478];
var y_data_2 = [2000,700,200,100,100,100,100,50,25,0];

// globals
var activePoint = null;
var myDraggableChart = null;

// draw a line chart on the myDraggableChart context
window.onload = function () {

    // Draw a line chart with two data sets
    var ctx = document.getElementById("myDraggableChart").getContext("2d");
    myDraggableChart = document.getElementById("myDraggableChart");
    window.myChart = Chart.Line(ctx, {
        data: {
            labels: x_data,
            datasets: [
                {
                    data: y_data_1,
                    label: "Data 1",
                    borderColor: "#3e95cd",
                    fill: false
                },
                {
                    data: y_data_2,
                    label: "Data 2",
                    borderColor: "#cd953e",
                    fill: false
                }
            ]
        },
        options: {
            animation: {
                duration: 0
            },
            tooltips: {
                mode: 'nearest'
            },
            scales: {
                yAxes: [{
                    stacked: true
                }]
            }
        }
    });

    // set pointer event handlers for canvas element
    myDraggableChart.onpointerdown = down_handler;
    myDraggableChart.onpointerup = up_handler;
    myDraggableChart.onpointermove = null;
};

function down_handler(event) {
    // check for data point near event location
    const points = window.myChart.getElementAtEvent(event, {intersect: false});
    if (points.length > 0) {
        // grab nearest point, start dragging
        activePoint = points[0];
        myDraggableChart.onpointermove = move_handler;
    };
};

function up_handler(event) {
    // release grabbed point, stop dragging
    activePoint = null;
    myDraggableChart.onpointermove = null;
};

function move_handler(event)
{
    // locate grabbed point in chart data
    if (activePoint != null) {
        var data = activePoint._chart.data;
        var datasetIndex = activePoint._datasetIndex;

        // read mouse position
        const helpers = Chart.helpers;
        var position = helpers.getRelativePosition(event, myChart);

        // convert mouse position to chart y axis value 
        var chartArea = window.myChart.chartArea;
        var yAxis = window.myChart.scales["y-axis-0"];
        var yValue = map(position.y, chartArea.bottom, chartArea.top, yAxis.min, yAxis.max);

        // update y value of active data point
        data.datasets[datasetIndex].data[activePoint._index] = yValue;
        window.myChart.update();
    };
};

// map value to other coordinate system
function map(value, start1, stop1, start2, stop2) {
    return start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1))
};

*/