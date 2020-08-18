from person import *
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.animation as animation
import matplotlib.backends
from matplotlib import rc
from math import sqrt
from itertools import combinations
from copy import deepcopy

# PARAMETERS :
N                   = 110   # population
L                   = 0.1   # in km
t_step              = 0.002 # in days
probability         = 0.05  # of getting infected after contact
radius              = 0.001 # in km
velocity            = 6     # in km/day
mean_infectious_pd  = 6.4   # in days
sd_infectious_pd    = 2.3   # in days
n_houses            = 100
stay_frac = 0.9

locality = Box(0,0,L,L)
workplace = Box(L,0,L-3*L/sqrt(n_houses),3*L/sqrt(n_houses))
quarantine_box = Box(L+2*radius,L+2*radius,1.1*L+2*radius,0.1*L)
quarantine_prob = 0.1
houses = []
for i in range(n_houses):
    house_x = np.random.randint(0, int(np.sqrt(n_houses)) )
    house_y = np.random.randint(0, int(np.sqrt(n_houses)) )
    houses.append(Box(locality.x1+house_x*L/np.sqrt(n_houses),
                      locality.y1+house_y*L/np.sqrt(n_houses),
                      locality.x1+(house_x+1)*L/np.sqrt(n_houses),
                      locality.y1+(house_y+1)*L/np.sqrt(n_houses)))
    #print(houses[-1])

Person.disease=Disease(radius, probability, mean_infectious_pd,sd_infectious_pd)
print(Person.disease)
Person.stay_frac = stay_frac

def stat_color(status):
    if status<0:
        return 0.
    elif status==0:
        return 0.5
    else:
        return 1.

population = []
X=[]
Y=[]
C=[]
tdata=[]
Sdata=[]
Idata=[]
Rdata=[]
cntr=np.array([[0,0,stat_color(0)],
               [0,1,stat_color(-1)],
               [1,2,stat_color(1)]])

for i in range(N):
    house = deepcopy(houses[np.random.randint(0,len(houses)-1)])
    population.append( Person(deepcopy(locality), house,
                              np.random.choice([house,deepcopy(workplace)],
                                               p=[0.8,0.2])))
# plant virus in one person
population[0].infect(definitely=True)

# update colours
for person in population:
    X.append(person.pos.x)
    Y.append(person.pos.y)
    C.append(stat_color(person.status))
t=0.0    
    
def update_plot(i, scat, Sline, Iline, Rline):
    global cntr
    global t
    susceptible = 0
    infected = 0
    removed = 0
    pos=[]
    c=[]
    t+=t_step

    sabziwala=population[1]
    if is_time_between(t,sabziwala.t_work,sabziwala.t_sleep-1):
        if (sabziwala.dest - sabziwala.pos).mag()<=t_step*velocity:
            sabziwala.dest = deepcopy(houses[np.random.randint(0,n_houses)].center())
    
    for combo in combinations(population,2):
        Person.contact_square(combo[0],combo[1])
    for person in population:
        person.move_routine(t_step*velocity,t)
        person.update(t_step)
        """
        if t>0.1 and person.status>0 and np.random.uniform()<quarantine_prob:
            person.box = deepcopy(quarantine_box)
        elif person.status==0 and quarantine_box.contains(person.pos):
            person.box = deepcopy(locality)
        """     
        if person.status<0:
            susceptible+=1
        elif person.status>0:
            infected+=1
        else:
            removed+=1
        
        pos.append([person.pos.x,person.pos.y])
        c.append(stat_color(person.status))

    #c[-1] = 0.7
    scat.set_offsets(np.array(pos))
    scat.set_array(np.array(c))
    tdata.append(t)
    Sdata.append(susceptible)
    Idata.append(infected)
    Rdata.append(removed)
     
    xmin, xmax = ax2.get_xlim()
    if t >= xmax:
        ax2.set_xlim(xmin, 2*xmax)
        ax2.figure.canvas.draw()
        
    Sline.set_data(tdata, Sdata)
    Iline.set_data(tdata, Idata)
    Rline.set_data(tdata, Rdata)
    if infected==0:
        anim.event_source.stop()
    return scat, Sline, Iline, Rline

# main ##################################################################
#plt.xkcd() # just for fun
fig = plt.figure(figsize=[10,4.8])#,facecolor='k')
(ax1,ax2) = fig.subplots(1,2)
ax1.axis('equal')
ax2.set_ylim(0,N)
scat = ax1.scatter(X, Y, c=C,cmap='jet',edgecolors='none')
Sline, = ax2.plot([], [], lw=2, color='b', label='Susceptible')
Iline, = ax2.plot([], [], lw=2, color='r', label='Infected')
Rline, = ax2.plot([], [], lw=2, color='g', label='Recovered')
#plt.legend()
ax2.legend(bbox_to_anchor=(1.2, 1.15))
# Animate
t=0.0
anim = animation.FuncAnimation(fig, update_plot, interval=0.1,
                               fargs=(scat, Sline, Iline, Rline),
                               blit=True)
plt.show()
