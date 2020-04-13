#import csv
import matplotlib.pyplot as plt
from collections import deque
import numpy as np
from scipy.stats import gamma

# PARAMETERS _______________________________________________________
N_HISTORY_DAYS = 14
I_HISTORY_DAYS = E_HISTORY_DAYS = N_HISTORY_DAYS
MEAN_INFECTIOUS_PD  = 6.4   # in days
SD_INFECTIOUS_PD    = 2.3   # in days
T_STEP = 1                  # in days

BETA = 0.6172
# __________________________________________________________________

inf_t_scale = SD_INFECTIOUS_PD**2/MEAN_INFECTIOUS_PD
inf_t_shape = MEAN_INFECTIOUS_PD / inf_t_scale
t_dist = gamma( a=inf_t_shape, scale=inf_t_scale)

RECOVERING_PROB_ARRAY   = t_dist.cdf(np.arange(N_HISTORY_DAYS))
FALLING_SICK_PROB_ARRAY = RECOVERING_PROB_ARRAY

# CLASS Layer =============================================

class Layer:
    def __init__(self,susc,N,E=0,I=0,R=0):
        self.susc=susc  #effectively equivalent to beta*(factors rel to immunity etc) 
        self.N=N
        self.S=N-E-I-R
        self.E=E
        self.I=I
        self.R=R
        #additional labels for Asymptomatic positive and negative and quarantine etc.
        self.exposed_history =deque([0]*E_HISTORY_DAYS, E_HISTORY_DAYS)
        self.infected_history=deque([0]*I_HISTORY_DAYS, I_HISTORY_DAYS)
        self.activation=0

        self.exposed_history.appendleft(E)
        self.infected_history.appendleft(I)

    def __str__(self):
        return "N:%g E:%g I:%g R%g"%(self.N,self.E,self.I,self.R)

    def update_expose(self,force):
        new_exposed = int(force*self.susc*self.S)    # or any general function of S/N
        new_exposed = min(new_exposed,self.S)
        self.E+=new_exposed
        self.S-=new_exposed
        self.exposed_history_push(new_exposed)

    def exposed_history_push(self,new_exposed):
        # falling sick today
        new_infected=0
        for i in range(E_HISTORY_DAYS):
            temp = int(self.exposed_history[i]*FALLING_SICK_PROB_ARRAY[i])
            self.exposed_history[i] -= temp
            new_infected+=temp

        new_infected+=self.exposed_history.pop()
        self.E-=new_infected
        self.I+=new_infected
        self.infected_history_push(new_infected)
        # add newly exposed
        self.exposed_history.appendleft(new_exposed)

    def infected_history_push(self,new_infected):
        # recovering today
        new_recovered = 0
        for i in range(I_HISTORY_DAYS):
            temp = int(self.infected_history[i]*RECOVERING_PROB_ARRAY[i])
            self.infected_history[i] -= temp
            new_recovered+=temp

        new_recovered+=self.infected_history.pop()
        self.I-=new_recovered
        self.R+=new_recovered
        # add newly infected
        self.infected_history.appendleft(new_infected)

        
# CLASS Block =============================================

class Block:
    def __init__(self,layers=[]):
        self.layers=layers
        self.calibrate_upwards()

    def calibrate_upwards(self):
        N=S=E=I=R=0
        for layer in self.layers:
            N+=layer.N
            E+=layer.E
            I+=layer.I
            R+=layer.R

        self.N=N
        self.S=N-E-I-R
        self.E=E
        self.I=I
        self.R=R

        #later add code to sum over history too

    def __str__(self):
        return "N:%g E:%g I:%g R%g"%(self.N,self.E,self.I,self.R)

    def update_expose(self,force=0):
        force = min(force,1.0)
        
        for layer in self.layers:
            layer.update_expose(force)
            
        self.calibrate_upwards()
        
#============================================================    
n_days = 120
city = Block([Layer(susc=BETA,N=10000,E=5),
              Layer(susc=BETA/8.0,N=10000,E=0),
              Layer(susc=BETA/4.0,N=10000,E=0)])
S=[]
E=[]
I=[]
R=[]
for i in range(n_days):
    print(city)
    city.update_expose(force=city.E/float(city.N))
    E.append(city.E)
    R.append(city.R)

plt.plot(range(n_days),E)
plt.plot(range(n_days),R)
plt.show()
    
    

